const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const NonAC = 0;
const AC = 1;
const Registration = { None: 0n, Pending: 1n, Verified: 2n };
const Allocation = { None: 0n, Allocated: 1n, Waitlisted: 2n };

async function deployFixture() {
  const [warden, ...rest] = await ethers.getSigners();
  const hostel = await (await ethers.getContractFactory("HostelAllocation")).deploy(warden.address);
  await hostel.waitForDeployment();

  /** register + approve a student in one go */
  async function enrol(signer, rollNo, year) {
    await hostel.connect(signer).register(rollNo, year);
    await hostel.approveStudent(signer.address);
  }
  return { hostel, warden, students: rest, enrol };
}

/** one single-bed NonAC room "A-101" */
async function oneBedFixture() {
  const base = await deployFixture();
  await base.hostel.addRoom("A-101", NonAC, 1);
  return base;
}

describe("HostelAllocation", () => {
  // ------------------------------------------------------------------ setup
  describe("deployment", () => {
    it("sets the warden as owner", async () => {
      const { hostel, warden } = await loadFixture(deployFixture);
      expect(await hostel.owner()).to.equal(warden.address);
    });

    it("does not allow renouncing ownership", async () => {
      const { hostel } = await loadFixture(deployFixture);
      await expect(hostel.renounceOwnership()).to.be.revertedWithCustomError(hostel, "RenounceDisabled");
    });
  });

  // ------------------------------------------------------------------ rooms
  describe("rooms", () => {
    it("lets the warden add rooms and emits an event", async () => {
      const { hostel } = await loadFixture(deployFixture);
      await expect(hostel.addRoom("A-101", AC, 2)).to.emit(hostel, "RoomAdded").withArgs(1, "A-101", AC, 2);
      const room = await hostel.getRoom(1);
      expect(room.number).to.equal("A-101");
      expect(room.capacity).to.equal(2n);
      expect(room.occupied).to.equal(0n);
      expect(await hostel.roomCount()).to.equal(1n);
    });

    it("rejects non-warden callers", async () => {
      const { hostel, students } = await loadFixture(deployFixture);
      await expect(hostel.connect(students[0]).addRoom("A-101", NonAC, 2))
        .to.be.revertedWithCustomError(hostel, "OwnableUnauthorizedAccount");
    });

    it("validates capacity, number and uniqueness", async () => {
      const { hostel } = await loadFixture(deployFixture);
      await expect(hostel.addRoom("A-1", NonAC, 0)).to.be.revertedWithCustomError(hostel, "InvalidCapacity");
      await expect(hostel.addRoom("A-1", NonAC, 7)).to.be.revertedWithCustomError(hostel, "InvalidCapacity");
      await expect(hostel.addRoom("", NonAC, 2)).to.be.revertedWithCustomError(hostel, "InvalidRoomNumber");
      await expect(hostel.addRoom("X".repeat(17), NonAC, 2)).to.be.revertedWithCustomError(hostel, "InvalidRoomNumber");
      await hostel.addRoom("A-1", NonAC, 2);
      await expect(hostel.addRoom("A-1", AC, 2)).to.be.revertedWithCustomError(hostel, "RoomNumberTaken");
    });

    it("paginates getRooms", async () => {
      const { hostel } = await loadFixture(deployFixture);
      for (let i = 1; i <= 5; i++) await hostel.addRoom(`R-${i}`, NonAC, 2);
      expect((await hostel.getRooms(0, 3)).length).to.equal(3);
      expect((await hostel.getRooms(3, 10)).length).to.equal(2);
      expect((await hostel.getRooms(9, 10)).length).to.equal(0);
    });

    it("reverts for unknown rooms", async () => {
      const { hostel } = await loadFixture(deployFixture);
      await expect(hostel.getRoom(0)).to.be.revertedWithCustomError(hostel, "RoomNotFound");
      await expect(hostel.getRoom(1)).to.be.revertedWithCustomError(hostel, "RoomNotFound");
    });
  });

  // ----------------------------------------------------------- registration
  describe("registration", () => {
    it("registers a student as pending and approves them", async () => {
      const { hostel, students } = await loadFixture(deployFixture);
      const [s] = students;
      await expect(hostel.connect(s).register("2329383", 3)).to.emit(hostel, "StudentRegistered").withArgs(s.address, "2329383", 3);
      expect((await hostel.getStudent(s.address)).registration).to.equal(Registration.Pending);

      await expect(hostel.approveStudent(s.address)).to.emit(hostel, "StudentApproved").withArgs(s.address);
      expect((await hostel.getStudent(s.address)).registration).to.equal(Registration.Verified);
    });

    it("validates input and blocks duplicates", async () => {
      const { hostel, students } = await loadFixture(deployFixture);
      const [a, b] = students;
      await expect(hostel.connect(a).register("", 1)).to.be.revertedWithCustomError(hostel, "InvalidRollNo");
      await expect(hostel.connect(a).register("R1", 0)).to.be.revertedWithCustomError(hostel, "InvalidYear");
      await expect(hostel.connect(a).register("R1", 6)).to.be.revertedWithCustomError(hostel, "InvalidYear");
      await hostel.connect(a).register("R1", 1);
      await expect(hostel.connect(a).register("R2", 1)).to.be.revertedWithCustomError(hostel, "AlreadyRegistered");
      await expect(hostel.connect(b).register("R1", 2)).to.be.revertedWithCustomError(hostel, "RollNoTaken");
    });

    it("only the warden can approve or reject, and only pending students", async () => {
      const { hostel, students } = await loadFixture(deployFixture);
      const [a] = students;
      await hostel.connect(a).register("R1", 1);
      await expect(hostel.connect(a).approveStudent(a.address)).to.be.revertedWithCustomError(hostel, "OwnableUnauthorizedAccount");
      await hostel.approveStudent(a.address);
      await expect(hostel.approveStudent(a.address)).to.be.revertedWithCustomError(hostel, "NotPending");
      await expect(hostel.rejectStudent(a.address)).to.be.revertedWithCustomError(hostel, "NotPending");
    });

    it("lets a rejected student register again with the same roll number", async () => {
      const { hostel, students } = await loadFixture(deployFixture);
      const [a] = students;
      await hostel.connect(a).register("R1", 1);
      await expect(hostel.rejectStudent(a.address)).to.emit(hostel, "StudentRejected").withArgs(a.address);
      expect((await hostel.getStudent(a.address)).registration).to.equal(Registration.None);
      await hostel.connect(a).register("R1", 2);
      expect(await hostel.studentCount()).to.equal(1n); // not listed twice
    });

    it("returns students in pages", async () => {
      const { hostel, students } = await loadFixture(deployFixture);
      for (let i = 0; i < 3; i++) await hostel.connect(students[i]).register(`R${i}`, 1);
      const [wallets, data] = await hostel.getStudents(1, 5);
      expect(wallets.length).to.equal(2);
      expect(data[0].rollNo).to.equal("R1");
    });
  });

  // ------------------------------------------------------------- allocation
  describe("allocation", () => {
    it("requires a verified student", async () => {
      const { hostel, students } = await loadFixture(oneBedFixture);
      await expect(hostel.connect(students[0]).applyForRoom(NonAC)).to.be.revertedWithCustomError(hostel, "NotVerified");
      await hostel.connect(students[0]).register("R1", 1);
      await expect(hostel.connect(students[0]).applyForRoom(NonAC)).to.be.revertedWithCustomError(hostel, "NotVerified");
    });

    it("allocates immediately when a bed is free", async () => {
      const { hostel, students, enrol } = await loadFixture(oneBedFixture);
      await enrol(students[0], "R1", 2);
      await expect(hostel.connect(students[0]).applyForRoom(NonAC))
        .to.emit(hostel, "RoomAllocated").withArgs(students[0].address, 1, false);

      const s = await hostel.getStudent(students[0].address);
      expect(s.allocation).to.equal(Allocation.Allocated);
      expect(s.roomId).to.equal(1n);
      expect((await hostel.getRoom(1)).occupied).to.equal(1n);
      expect(await hostel.getResidents(1)).to.deep.equal([students[0].address]);
      expect(await hostel.roomsWithVacancy(NonAC)).to.equal(0n);
    });

    it("does not allow a second application", async () => {
      const { hostel, students, enrol } = await loadFixture(oneBedFixture);
      await enrol(students[0], "R1", 2);
      await hostel.connect(students[0]).applyForRoom(NonAC);
      await expect(hostel.connect(students[0]).applyForRoom(NonAC)).to.be.revertedWithCustomError(hostel, "AlreadyApplied");
    });

    it("keeps AC and NonAC pools separate", async () => {
      const { hostel, students, enrol } = await loadFixture(oneBedFixture);
      await enrol(students[0], "R1", 2);
      await expect(hostel.connect(students[0]).applyForRoom(AC)).to.emit(hostel, "AddedToWaitlist").withArgs(students[0].address, AC, 2);
      expect(await hostel.waitlistLength(AC)).to.equal(1n);
      expect(await hostel.waitlistLength(NonAC)).to.equal(0n);
    });

    it("fills a multi-bed room before moving on, then waitlists", async () => {
      const { hostel, students, enrol } = await loadFixture(deployFixture);
      await hostel.addRoom("B-201", NonAC, 2);
      for (let i = 0; i < 3; i++) await enrol(students[i], `R${i}`, 1);

      await hostel.connect(students[0]).applyForRoom(NonAC);
      await hostel.connect(students[1]).applyForRoom(NonAC);
      expect((await hostel.getRoom(1)).occupied).to.equal(2n);

      await hostel.connect(students[2]).applyForRoom(NonAC);
      expect((await hostel.getStudent(students[2].address)).allocation).to.equal(Allocation.Waitlisted);
      expect(await hostel.waitlistPosition(students[2].address)).to.equal(1n);
    });

    it("never overfills a room", async () => {
      const { hostel, students, enrol } = await loadFixture(deployFixture);
      await hostel.addRoom("B-201", NonAC, 3);
      for (let i = 0; i < 6; i++) {
        await enrol(students[i], `R${i}`, 1);
        await hostel.connect(students[i]).applyForRoom(NonAC);
      }
      const room = await hostel.getRoom(1);
      expect(room.occupied).to.equal(3n);
      expect((await hostel.getResidents(1)).length).to.equal(3);
      expect(await hostel.waitlistLength(NonAC)).to.equal(3n);
    });
  });

  // --------------------------------------------------------------- waitlist
  describe("waitlist", () => {
    async function waitlistFixture() {
      const base = await oneBedFixture();
      const { students, enrol, hostel } = base;
      // students[0] holds the only bed
      await enrol(students[0], "HOLDER", 1);
      await hostel.connect(students[0]).applyForRoom(NonAC);
      return base;
    }

    it("serves higher years first, then first-come-first-served", async () => {
      const { hostel, students, enrol } = await loadFixture(waitlistFixture);
      const [, first, second, senior] = students;
      await enrol(first, "Y1-A", 1);
      await enrol(second, "Y1-B", 1);
      await enrol(senior, "Y4-A", 4);
      await hostel.connect(first).applyForRoom(NonAC);
      await hostel.connect(second).applyForRoom(NonAC);
      await hostel.connect(senior).applyForRoom(NonAC);

      expect(await hostel.getWaitlist(NonAC)).to.deep.equal([senior.address, first.address, second.address]);
      expect(await hostel.waitlistPosition(senior.address)).to.equal(1n);
      expect(await hostel.waitlistPosition(first.address)).to.equal(2n);
      expect(await hostel.waitlistPosition(second.address)).to.equal(3n);
    });

    it("promotes the next student automatically when a room is vacated", async () => {
      const { hostel, students, enrol } = await loadFixture(waitlistFixture);
      const [holder, first, , senior] = students;
      await enrol(first, "Y1-A", 1);
      await enrol(students[2], "Y1-B", 1);
      await enrol(senior, "Y4-A", 4);
      await hostel.connect(first).applyForRoom(NonAC);
      await hostel.connect(students[2]).applyForRoom(NonAC);
      await hostel.connect(senior).applyForRoom(NonAC);

      await expect(hostel.connect(holder).vacateRoom())
        .to.emit(hostel, "RoomVacated").withArgs(holder.address, 1, false)
        .and.to.emit(hostel, "RoomAllocated").withArgs(senior.address, 1, true);

      expect((await hostel.getStudent(senior.address)).allocation).to.equal(Allocation.Allocated);
      expect((await hostel.getStudent(holder.address)).allocation).to.equal(Allocation.None);
      expect(await hostel.waitlistLength(NonAC)).to.equal(2n);
      expect(await hostel.waitlistPosition(first.address)).to.equal(1n);
    });

    it("lets a vacated student apply again", async () => {
      const { hostel, students } = await loadFixture(waitlistFixture);
      const [holder] = students;
      await hostel.connect(holder).vacateRoom();
      await hostel.connect(holder).applyForRoom(NonAC);
      expect((await hostel.getStudent(holder.address)).allocation).to.equal(Allocation.Allocated);
    });

    it("lets a student leave the waitlist and skips them when serving", async () => {
      const { hostel, students, enrol } = await loadFixture(waitlistFixture);
      const [holder, a, b] = students;
      await enrol(a, "A", 1);
      await enrol(b, "B", 1);
      await hostel.connect(a).applyForRoom(NonAC);
      await hostel.connect(b).applyForRoom(NonAC);

      await expect(hostel.connect(a).cancelApplication()).to.emit(hostel, "LeftWaitlist").withArgs(a.address, false);
      expect(await hostel.waitlistPosition(b.address)).to.equal(1n);
      expect(await hostel.getWaitlist(NonAC)).to.deep.equal([b.address]);

      await hostel.connect(holder).vacateRoom();
      expect((await hostel.getStudent(b.address)).allocation).to.equal(Allocation.Allocated);
      expect((await hostel.getStudent(a.address)).allocation).to.equal(Allocation.None);
    });

    it("sends a student who cancels and re-applies to the back of the queue", async () => {
      const { hostel, students, enrol } = await loadFixture(waitlistFixture);
      const [, a, b] = students;
      await enrol(a, "A", 1);
      await enrol(b, "B", 1);
      await hostel.connect(a).applyForRoom(NonAC);
      await hostel.connect(b).applyForRoom(NonAC);
      await hostel.connect(a).cancelApplication();
      await hostel.connect(a).applyForRoom(NonAC);
      expect(await hostel.getWaitlist(NonAC)).to.deep.equal([b.address, a.address]);
      expect(await hostel.waitlistPosition(a.address)).to.equal(2n);
    });

    it("cannot cancel without waiting, or vacate without a room", async () => {
      const { hostel, students } = await loadFixture(waitlistFixture);
      await expect(hostel.connect(students[0]).cancelApplication()).to.be.revertedWithCustomError(hostel, "NotWaitlisted");
      await expect(hostel.connect(students[5]).vacateRoom()).to.be.revertedWithCustomError(hostel, "NotAllocated");
    });

    it("serves the waitlist when the warden adds a room", async () => {
      const { hostel, students, enrol } = await loadFixture(waitlistFixture);
      await enrol(students[1], "A", 1);
      await hostel.connect(students[1]).applyForRoom(NonAC);
      await expect(hostel.addRoom("A-102", NonAC, 1))
        .to.emit(hostel, "RoomAllocated").withArgs(students[1].address, 2, true);
      expect(await hostel.waitlistLength(NonAC)).to.equal(0n);
    });

    it("only serves waitlisted students of the matching room type", async () => {
      const { hostel, students, enrol } = await loadFixture(waitlistFixture);
      await enrol(students[1], "A", 1);
      await hostel.connect(students[1]).applyForRoom(AC); // waits for AC
      await hostel.addRoom("A-102", NonAC, 1); // NonAC room must not serve AC waiter
      expect((await hostel.getStudent(students[1].address)).allocation).to.equal(Allocation.Waitlisted);
      await hostel.addRoom("A-103", AC, 1);
      expect((await hostel.getStudent(students[1].address)).allocation).to.equal(Allocation.Allocated);
    });
  });

  // --------------------------------------------------------------- eviction
  describe("eviction", () => {
    it("frees the room and promotes the next student", async () => {
      const { hostel, students, enrol } = await loadFixture(oneBedFixture);
      const [a, b] = students;
      await enrol(a, "A", 1);
      await enrol(b, "B", 1);
      await hostel.connect(a).applyForRoom(NonAC);
      await hostel.connect(b).applyForRoom(NonAC);

      await expect(hostel.evictStudent(a.address)).to.emit(hostel, "RoomVacated").withArgs(a.address, 1, true);
      expect((await hostel.getStudent(b.address)).allocation).to.equal(Allocation.Allocated);
    });

    it("removes a waitlisted student", async () => {
      const { hostel, students, enrol } = await loadFixture(oneBedFixture);
      const [a, b] = students;
      await enrol(a, "A", 1);
      await enrol(b, "B", 1);
      await hostel.connect(a).applyForRoom(NonAC);
      await hostel.connect(b).applyForRoom(NonAC);
      await expect(hostel.evictStudent(b.address)).to.emit(hostel, "LeftWaitlist").withArgs(b.address, true);
      expect(await hostel.waitlistLength(NonAC)).to.equal(0n);
    });

    it("reverts when there is nothing to evict and for non-wardens", async () => {
      const { hostel, students } = await loadFixture(oneBedFixture);
      await expect(hostel.evictStudent(students[0].address)).to.be.revertedWithCustomError(hostel, "NothingToEvict");
      await expect(hostel.connect(students[0]).evictStudent(students[1].address))
        .to.be.revertedWithCustomError(hostel, "OwnableUnauthorizedAccount");
    });
  });

  // ------------------------------------------------------------ maintenance
  describe("maintenance", () => {
    it("takes an empty room out of the pool and returns it", async () => {
      const { hostel, students, enrol } = await loadFixture(oneBedFixture);
      await expect(hostel.setMaintenance(1, true)).to.emit(hostel, "RoomMaintenanceChanged").withArgs(1, true);
      expect(await hostel.roomsWithVacancy(NonAC)).to.equal(0n);

      await enrol(students[0], "A", 1);
      await hostel.connect(students[0]).applyForRoom(NonAC); // no bed -> waitlist
      expect((await hostel.getStudent(students[0].address)).allocation).to.equal(Allocation.Waitlisted);

      await expect(hostel.setMaintenance(1, false))
        .to.emit(hostel, "RoomAllocated").withArgs(students[0].address, 1, true);
    });

    it("refuses to close an occupied room and invalid toggles", async () => {
      const { hostel, students, enrol } = await loadFixture(oneBedFixture);
      await enrol(students[0], "A", 1);
      await hostel.connect(students[0]).applyForRoom(NonAC);
      await expect(hostel.setMaintenance(1, true)).to.be.revertedWithCustomError(hostel, "RoomNotEmpty");
      await expect(hostel.setMaintenance(1, false)).to.be.revertedWithCustomError(hostel, "NoChange");
      await expect(hostel.setMaintenance(9, true)).to.be.revertedWithCustomError(hostel, "RoomNotFound");
    });
  });

  // ---------------------------------------------------------------- pausing
  describe("pausing", () => {
    it("blocks applications while paused but still allows vacating", async () => {
      const { hostel, students, enrol } = await loadFixture(oneBedFixture);
      await enrol(students[0], "A", 1);
      await enrol(students[1], "B", 1);
      await hostel.connect(students[0]).applyForRoom(NonAC);

      await hostel.pause();
      await expect(hostel.connect(students[1]).applyForRoom(NonAC)).to.be.revertedWithCustomError(hostel, "EnforcedPause");
      await expect(hostel.connect(students[0]).vacateRoom()).not.to.be.reverted;

      await hostel.unpause();
      await expect(hostel.connect(students[1]).applyForRoom(NonAC)).not.to.be.reverted;
    });

    it("only the warden can pause", async () => {
      const { hostel, students } = await loadFixture(deployFixture);
      await expect(hostel.connect(students[0]).pause()).to.be.revertedWithCustomError(hostel, "OwnableUnauthorizedAccount");
    });
  });

  // --------------------------------------------------------------- stress
  describe("invariants", () => {
    it("keeps occupancy, residents and waitlist consistent through a long scenario", async () => {
      const { hostel, students, enrol } = await loadFixture(deployFixture);
      await hostel.addRoom("S-1", NonAC, 2);
      await hostel.addRoom("S-2", NonAC, 1);

      const people = students.slice(0, 10);
      for (let i = 0; i < people.length; i++) await enrol(people[i], `S${i}`, (i % 4) + 1);
      for (const p of people) await hostel.connect(p).applyForRoom(NonAC);

      const check = async () => {
        let seated = 0;
        for (let id = 1; id <= 2; id++) {
          const room = await hostel.getRoom(id);
          const res = await hostel.getResidents(id);
          expect(res.length).to.equal(Number(room.occupied));
          expect(room.occupied <= room.capacity).to.equal(true);
          seated += res.length;
        }
        const waiting = (await hostel.getWaitlist(NonAC)).length;
        expect(Number(await hostel.waitlistLength(NonAC))).to.equal(waiting);
        // everybody is either seated or waiting
        expect(seated + waiting).to.equal(people.filter(() => true).length - removed);
        // a free bed and a waitlist can never coexist
        if (waiting > 0) expect(await hostel.roomsWithVacancy(NonAC)).to.equal(0n);
      };

      let removed = 0;
      await check();
      for (let round = 0; round < 3; round++) {
        for (const p of people) {
          const s = await hostel.getStudent(p.address);
          if (s.allocation === Allocation.Allocated) {
            await hostel.connect(p).vacateRoom();
            removed++;
            await check();
            break;
          }
        }
      }
    });
  });
});
