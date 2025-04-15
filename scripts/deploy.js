// This script handles deploying the VeritasVote contract.
const hre = require("hardhat");

async function main() {
  console.log("Deploying VeritasVote contract...");

  // Get the contract factory
  const VeritasVote = await hre.ethers.getContractFactory("VeritasVote");

  // Start the deployment, returning a promise that resolves to a contract object
  const veritasVote = await VeritasVote.deploy();

  // Wait for the contract deployment transaction to be mined
  await veritasVote.deployed();

  console.log(`VeritasVote deployed to: ${veritasVote.address}`);
  console.log(`Transaction hash: ${veritasVote.deployTransaction.hash}`);

  // Optional: Wait for a few confirmations if deploying to a testnet/mainnet
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
     console.log("Waiting for block confirmations...");
     await veritasVote.deployTransaction.wait(6); // Wait for 6 confirmations
     console.log("Confirmed!");
  }

  // Optional: Automatically attempt to verify the contract on Etherscan
  if (hre.network.config.chainId && process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
     console.log(`Verifying contract on Etherscan (${hre.network.name})...`);
     try {
        await hre.run("verify:verify", {
            address: veritasVote.address,
            constructorArguments: [], // Add constructor args if your contract has them
        });
        console.log("Contract verified successfully on Etherscan!");
     } catch (error) {
         console.error("Etherscan verification failed:", error);
         if (error.message.toLowerCase().includes("already verified")) {
             console.log("Contract seems to be already verified.");
         }
     }
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });