// Fills a freshly deployed local contract with demo data so the UI has something to show.
//   npm run seed:local
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const NonAC = 0;
const AC = 1;

async function main() {
  const file = path.join(__dirname, "..", "frontend", "src", "contracts", "HostelAllocation.json");
  const { address } = JSON.parse(fs.readFileSync(file, "utf8"));
  const [warden, ...accounts] = await hre.ethers.getSigners();
  const hostel = await hre.ethers.getContractAt("HostelAllocation", address, warden);

  console.log("Adding rooms...");
  const rooms = [
    ["A-101", NonAC, 2], ["A-102", NonAC, 2], ["A-103", NonAC, 3], ["A-104", NonAC, 1],
    ["B-201", AC, 2],    ["B-202", AC, 1],
  ];
  for (const [n, t, c] of rooms) await (await hostel.addRoom(n, t, c)).wait();

  console.log("Registering students...");
  const people = [
    ["2329383", 3], ["2329101", 1], ["2329207", 2], ["2329455", 4],
    ["2329512", 1], ["2329660", 2], ["2329718", 3], ["2329801", 5],
  ];
  for (let i = 0; i < people.length; i++) {
    const s = accounts[i];
    await (await hostel.connect(s).register(people[i][0], people[i][1])).wait();
    if (i < people.length - 2) await (await hostel.approveStudent(s.address)).wait(); // last two stay pending
  }

  console.log("Applying for rooms...");
  // Five students want AC but only three AC beds exist, so two end up on the waitlist.
  const wanted = [AC, AC, NonAC, AC, AC, AC];
  for (let i = 0; i < wanted.length; i++) {
    await (await hostel.connect(accounts[i]).applyForRoom(wanted[i])).wait();
  }

  console.log("\nDemo data ready.");
  console.log(`Warden (owner):  ${warden.address}`);
  accounts.slice(0, people.length).forEach((a, i) =>
    console.log(`Student ${people[i][0]} (year ${people[i][1]}): ${a.address}`)
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
