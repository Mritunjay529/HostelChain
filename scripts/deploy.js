const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const OUTPUT = path.join(__dirname, "..", "frontend", "src", "contracts", "HostelAllocation.json");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const { chainId } = await hre.ethers.provider.getNetwork();
  console.log(`Deploying with warden account ${deployer.address} on chain ${chainId}`);

  const factory = await hre.ethers.getContractFactory("HostelAllocation");
  const hostel = await factory.deploy(deployer.address);
  await hostel.waitForDeployment();
  const address = await hostel.getAddress();
  const receipt = await hostel.deploymentTransaction().wait();
  console.log(`HostelAllocation deployed to ${address}`);

  // Hand the address + ABI to the frontend.
  const artifact = await hre.artifacts.readArtifact("HostelAllocation");
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(
      { address, chainId: Number(chainId), deployBlock: receipt.blockNumber, abi: artifact.abi },
      null,
      2
    )
  );
  console.log(`Wrote address + ABI to ${path.relative(process.cwd(), OUTPUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
