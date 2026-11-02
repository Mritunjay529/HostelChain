// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title HostelAllocation
 * @notice Transparent hostel room allocation with a priority waitlist.
 *
 * Flow
 *  1. Warden (owner) adds rooms.
 *  2. Student registers (roll number + year) -> Pending.
 *  3. Warden verifies the roll number against college records and approves -> Verified.
 *  4. Verified student applies for a room type (NonAC / AC).
 *       - a room with a free bed exists  -> allocated immediately
 *       - otherwise                      -> added to the waitlist
 *  5. Whenever a bed frees up (vacate, eviction, new room, maintenance ends) the
 *     waitlist is served automatically:
 *       - higher academic year first (final-year students have priority)
 *       - first-come-first-served inside the same year
 *
 * Design notes
 *  - Waitlist = one FIFO queue per (room type, year). Pops are O(years), not O(n).
 *  - Cancelled waitlist entries are removed lazily; every entry carries a ticket
 *    so a stale entry can never be mistaken for a re-application.
 *  - Rooms with a free bed are tracked in a per-type list, so allocation is O(1).
 *  - Invariant: for a room type, "free beds exist" and "waitlist is non-empty"
 *    are never true at the same time.
 *  - Personal data on-chain is limited to the roll number. A production system
 *    should store a hash/commitment instead.
 */
contract HostelAllocation is Ownable, Pausable {
    // ------------------------------------------------------------------ types

    enum RoomType {
        NonAC,
        AC
    }
    enum Registration {
        None,
        Pending,
        Verified
    }
    enum Allocation {
        None,
        Allocated,
        Waitlisted
    }

    struct Room {
        uint32 id;
        string number;
        RoomType roomType;
        uint8 capacity;
        uint8 occupied;
        bool underMaintenance;
    }

    struct Student {
        string rollNo;
        uint8 year;
        Registration registration;
        Allocation allocation;
        RoomType requestedType;
        uint32 roomId;
        uint64 ticket;
    }

    struct QueueEntry {
        address student;
        uint64 ticket;
    }

    struct Queue {
        uint64 head;
        uint64 tail;
        mapping(uint64 => QueueEntry) entries;
    }

    // -------------------------------------------------------------- constants

    uint8 public constant MAX_YEAR = 5;
    uint8 public constant MAX_CAPACITY = 6;
    uint256 private constant MAX_ROLL_NO_LENGTH = 32;
    uint256 private constant MAX_ROOM_NUMBER_LENGTH = 16;

    // ---------------------------------------------------------------- storage

    uint32 public roomCount;
    uint64 private _lastTicket;

    mapping(uint32 => Room) private _rooms;
    mapping(uint32 => address[]) private _residents;
    mapping(bytes32 => bool) private _roomNumberTaken;

    mapping(address => Student) private _students;
    mapping(bytes32 => address) private _rollNoOwner;
    mapping(address => bool) private _listed;
    address[] private _studentList;

    mapping(RoomType => uint32[]) private _freeRooms;
    mapping(uint32 => uint256) private _freeIndexPlusOne;

    mapping(RoomType => mapping(uint8 => Queue)) private _queues;
    mapping(RoomType => mapping(uint8 => uint256)) private _waitingCount;

    // ----------------------------------------------------------------- events

    event RoomAdded(uint32 indexed roomId, string number, RoomType roomType, uint8 capacity);
    event RoomMaintenanceChanged(uint32 indexed roomId, bool underMaintenance);
    event StudentRegistered(address indexed student, string rollNo, uint8 year);
    event StudentApproved(address indexed student);
    event StudentRejected(address indexed student);
    event RoomAllocated(address indexed student, uint32 indexed roomId, bool fromWaitlist);
    event AddedToWaitlist(address indexed student, RoomType roomType, uint8 year);
    event LeftWaitlist(address indexed student, bool byWarden);
    event RoomVacated(address indexed student, uint32 indexed roomId, bool byWarden);

    // ----------------------------------------------------------------- errors

    error InvalidRollNo();
    error InvalidYear();
    error InvalidCapacity();
    error InvalidRoomNumber();
    error RoomNumberTaken();
    error RoomNotFound();
    error RoomNotEmpty();
    error NoChange();
    error AlreadyRegistered();
    error RollNoTaken();
    error NotPending();
    error NotVerified();
    error AlreadyApplied();
    error NotAllocated();
    error NotWaitlisted();
    error NothingToEvict();
    error RenounceDisabled();

    // ------------------------------------------------------------ constructor

    constructor(address warden) Ownable(warden) {}

    /// @dev Losing the warden would brick the system, so renouncing is disabled.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    // ------------------------------------------------------------ warden: rooms

    function addRoom(string calldata number, RoomType roomType, uint8 capacity)
        external
        onlyOwner
        returns (uint32 id)
    {
        uint256 len = bytes(number).length;
        if (len == 0 || len > MAX_ROOM_NUMBER_LENGTH) revert InvalidRoomNumber();
        if (capacity == 0 || capacity > MAX_CAPACITY) revert InvalidCapacity();

        bytes32 key = keccak256(bytes(number));
        if (_roomNumberTaken[key]) revert RoomNumberTaken();
        _roomNumberTaken[key] = true;

        id = ++roomCount;
        _rooms[id] = Room(id, number, roomType, capacity, 0, false);
        _addFree(id, roomType);

        emit RoomAdded(id, number, roomType, capacity);
        _fillFromWaitlist(roomType);
    }

    /// @notice Take an empty room out of service (or put it back).
    function setMaintenance(uint32 roomId, bool on) external onlyOwner {
        Room storage room = _room(roomId);
        if (room.underMaintenance == on) revert NoChange();

        if (on) {
            if (room.occupied != 0) revert RoomNotEmpty();
            room.underMaintenance = true;
            _removeFree(roomId, room.roomType);
        } else {
            room.underMaintenance = false;
            _addFree(roomId, room.roomType);
        }
        emit RoomMaintenanceChanged(roomId, on);
        if (!on) _fillFromWaitlist(room.roomType);
    }

    // --------------------------------------------------------- warden: students

    function approveStudent(address student) external onlyOwner {
        Student storage s = _students[student];
        if (s.registration != Registration.Pending) revert NotPending();
        s.registration = Registration.Verified;
        emit StudentApproved(student);
    }

    /// @notice Reject a pending registration. The student may register again.
    function rejectStudent(address student) external onlyOwner {
        Student storage s = _students[student];
        if (s.registration != Registration.Pending) revert NotPending();
        delete _rollNoOwner[keccak256(bytes(s.rollNo))];
        delete _students[student];
        emit StudentRejected(student);
    }

    /// @notice Remove a student from their room or from the waitlist (e.g. graduated, left).
    function evictStudent(address student) external onlyOwner {
        Student storage s = _students[student];
        if (s.allocation == Allocation.Allocated) {
            RoomType t = _rooms[s.roomId].roomType;
            _release(student, true);
            _fillFromWaitlist(t);
        } else if (s.allocation == Allocation.Waitlisted) {
            _leaveWaitlist(student, true);
        } else {
            revert NothingToEvict();
        }
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // -------------------------------------------------------------- student

    function register(string calldata rollNo, uint8 year) external {
        Student storage s = _students[msg.sender];
        if (s.registration != Registration.None) revert AlreadyRegistered();

        uint256 len = bytes(rollNo).length;
        if (len == 0 || len > MAX_ROLL_NO_LENGTH) revert InvalidRollNo();
        if (year == 0 || year > MAX_YEAR) revert InvalidYear();

        bytes32 key = keccak256(bytes(rollNo));
        if (_rollNoOwner[key] != address(0)) revert RollNoTaken();
        _rollNoOwner[key] = msg.sender;

        s.rollNo = rollNo;
        s.year = year;
        s.registration = Registration.Pending;

        if (!_listed[msg.sender]) {
            _listed[msg.sender] = true;
            _studentList.push(msg.sender);
        }
        emit StudentRegistered(msg.sender, rollNo, year);
    }

    function applyForRoom(RoomType roomType) external whenNotPaused {
        Student storage s = _students[msg.sender];
        if (s.registration != Registration.Verified) revert NotVerified();
        if (s.allocation != Allocation.None) revert AlreadyApplied();

        s.requestedType = roomType;
        uint32[] storage free = _freeRooms[roomType];

        if (free.length > 0) {
            _allocate(msg.sender, free[0], false);
        } else {
            _enqueue(msg.sender, roomType);
        }
    }

    function cancelApplication() external {
        if (_students[msg.sender].allocation != Allocation.Waitlisted) revert NotWaitlisted();
        _leaveWaitlist(msg.sender, false);
    }

    function vacateRoom() external {
        Student storage s = _students[msg.sender];
        if (s.allocation != Allocation.Allocated) revert NotAllocated();
        RoomType t = _rooms[s.roomId].roomType;
        _release(msg.sender, false);
        _fillFromWaitlist(t);
    }

    // ---------------------------------------------------------------- views

    function getRoom(uint32 roomId) external view returns (Room memory) {
        return _room(roomId);
    }

    function getRooms(uint32 offset, uint32 limit) external view returns (Room[] memory out) {
        uint32 total = roomCount;
        if (offset >= total) return new Room[](0);
        uint32 end = offset + limit > total ? total : offset + limit;
        out = new Room[](end - offset);
        for (uint32 i = offset; i < end; i++) {
            out[i - offset] = _rooms[i + 1];
        }
    }

    function getResidents(uint32 roomId) external view returns (address[] memory) {
        _room(roomId);
        return _residents[roomId];
    }

    function getStudent(address student) external view returns (Student memory) {
        return _students[student];
    }

    function studentCount() external view returns (uint256) {
        return _studentList.length;
    }

    function getStudents(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory wallets, Student[] memory data)
    {
        uint256 total = _studentList.length;
        if (offset >= total) return (new address[](0), new Student[](0));
        uint256 end = offset + limit > total ? total : offset + limit;
        wallets = new address[](end - offset);
        data = new Student[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            wallets[i - offset] = _studentList[i];
            data[i - offset] = _students[_studentList[i]];
        }
    }

    /// @notice Number of rooms of this type that still have a free bed.
    function roomsWithVacancy(RoomType roomType) external view returns (uint256) {
        return _freeRooms[roomType].length;
    }

    function waitlistLength(RoomType roomType) public view returns (uint256 total) {
        for (uint8 y = 1; y <= MAX_YEAR; y++) {
            total += _waitingCount[roomType][y];
        }
    }

    /// @notice 1-based position in the waitlist, or 0 if the student is not waiting.
    function waitlistPosition(address student) external view returns (uint256) {
        Student storage s = _students[student];
        if (s.allocation != Allocation.Waitlisted) return 0;

        RoomType t = s.requestedType;
        uint256 ahead;
        for (uint8 y = MAX_YEAR; y > s.year; y--) {
            ahead += _waitingCount[t][y];
        }
        Queue storage q = _queues[t][s.year];
        for (uint64 i = q.head; i < q.tail; i++) {
            QueueEntry storage e = q.entries[i];
            if (e.student == student && e.ticket == s.ticket) break;
            if (_isLive(e)) ahead++;
        }
        return ahead + 1;
    }

    /// @notice Waitlist in the exact order students will be served.
    function getWaitlist(RoomType roomType) external view returns (address[] memory list) {
        list = new address[](waitlistLength(roomType));
        uint256 n;
        for (uint8 y = MAX_YEAR; y > 0; y--) {
            Queue storage q = _queues[roomType][y];
            for (uint64 i = q.head; i < q.tail; i++) {
                QueueEntry storage e = q.entries[i];
                if (_isLive(e)) list[n++] = e.student;
            }
        }
    }

    // ------------------------------------------------------------- internals

    function _room(uint32 roomId) private view returns (Room storage r) {
        if (roomId == 0 || roomId > roomCount) revert RoomNotFound();
        r = _rooms[roomId];
    }

    function _allocate(address who, uint32 roomId, bool fromWaitlist) private {
        Room storage r = _rooms[roomId];
        r.occupied += 1;
        _residents[roomId].push(who);

        Student storage s = _students[who];
        s.allocation = Allocation.Allocated;
        s.roomId = roomId;
        s.ticket = 0;

        if (r.occupied == r.capacity) _removeFree(roomId, r.roomType);
        emit RoomAllocated(who, roomId, fromWaitlist);
    }

    function _release(address who, bool byWarden) private {
        Student storage s = _students[who];
        uint32 roomId = s.roomId;
        Room storage r = _rooms[roomId];

        r.occupied -= 1;
        address[] storage res = _residents[roomId];
        for (uint256 i = 0; i < res.length; i++) {
            if (res[i] == who) {
                res[i] = res[res.length - 1];
                res.pop();
                break;
            }
        }

        s.allocation = Allocation.None;
        s.roomId = 0;
        if (_freeIndexPlusOne[roomId] == 0) _addFree(roomId, r.roomType);
        emit RoomVacated(who, roomId, byWarden);
    }

    function _enqueue(address who, RoomType t) private {
        Student storage s = _students[who];
        s.allocation = Allocation.Waitlisted;
        s.ticket = ++_lastTicket;

        Queue storage q = _queues[t][s.year];
        q.entries[q.tail++] = QueueEntry(who, s.ticket);
        _waitingCount[t][s.year] += 1;
        emit AddedToWaitlist(who, t, s.year);
    }

    function _leaveWaitlist(address who, bool byWarden) private {
        Student storage s = _students[who];
        _waitingCount[s.requestedType][s.year] -= 1;
        s.allocation = Allocation.None;
        s.ticket = 0; // invalidates the queue entry
        emit LeftWaitlist(who, byWarden);
    }

    function _isLive(QueueEntry storage e) private view returns (bool) {
        Student storage s = _students[e.student];
        return s.allocation == Allocation.Waitlisted && s.ticket == e.ticket;
    }

    /// @dev Highest year first, FIFO inside a year. Skips cancelled entries.
    function _popWaitlist(RoomType t) private returns (address) {
        for (uint8 y = MAX_YEAR; y > 0; y--) {
            if (_waitingCount[t][y] == 0) continue;
            Queue storage q = _queues[t][y];
            while (q.head < q.tail) {
                QueueEntry memory e = q.entries[q.head];
                delete q.entries[q.head];
                q.head++;
                Student storage s = _students[e.student];
                if (s.allocation == Allocation.Waitlisted && s.ticket == e.ticket) {
                    _waitingCount[t][y] -= 1;
                    return e.student;
                }
            }
        }
        return address(0);
    }

    function _fillFromWaitlist(RoomType t) private {
        uint32[] storage free = _freeRooms[t];
        while (free.length > 0) {
            address next = _popWaitlist(t);
            if (next == address(0)) break;
            _allocate(next, free[0], true);
        }
    }

    function _addFree(uint32 roomId, RoomType t) private {
        _freeRooms[t].push(roomId);
        _freeIndexPlusOne[roomId] = _freeRooms[t].length;
    }

    function _removeFree(uint32 roomId, RoomType t) private {
        uint256 idx = _freeIndexPlusOne[roomId];
        if (idx == 0) return;
        uint32[] storage list = _freeRooms[t];
        uint32 last = list[list.length - 1];
        list[idx - 1] = last;
        _freeIndexPlusOne[last] = idx;
        list.pop();
        _freeIndexPlusOne[roomId] = 0;
    }
}
