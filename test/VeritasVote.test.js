const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers"); // For fixtures

describe("VeritasVote Contract Tests", function () {
    // We define a fixture to reuse the same setup in every test.
    async function deployVeritasVoteFixture() {
        // Get signers (accounts)
        const [owner, voter1, voter2, nonVoter] = await ethers.getSigners();

        // Deploy the contract
        const VeritasVote = await ethers.getContractFactory("VeritasVote");
        const veritasVote = await VeritasVote.deploy();
        await veritasVote.deployed();

        // Return values needed for tests
        return { veritasVote, owner, voter1, voter2, nonVoter };
    }

    // Test Suite for Deployment and Initialization
    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            const { veritasVote, owner } = await loadFixture(deployVeritasVoteFixture);
            expect(await veritasVote.owner()).to.equal(owner.address);
        });

        it("Should initialize nextElectionId to 1", async function () {
             const { veritasVote } = await loadFixture(deployVeritasVoteFixture);
             // Internal variable, so test through function that uses it implicitly
             expect(await veritasVote.getTotalElections()).to.equal(0); // No elections created yet
        });
    });

    // Test Suite for Voter Management
    describe("Voter Management", function () {
        it("Owner should be able to register a voter", async function () {
            const { veritasVote, owner, voter1 } = await loadFixture(deployVeritasVoteFixture);
            await expect(veritasVote.connect(owner).registerVoter(voter1.address))
                .to.emit(veritasVote, "VoterRegistered")
                .withArgs(voter1.address);
            expect(await veritasVote.isRegisteredVoter(voter1.address)).to.be.true;
        });

        it("Owner should be able to register multiple voters using batch", async function () {
            const { veritasVote, owner, voter1, voter2 } = await loadFixture(deployVeritasVoteFixture);
            const votersToRegister = [voter1.address, voter2.address];
            await expect(veritasVote.connect(owner).registerVotersBatch(votersToRegister))
                .to.emit(veritasVote, "VoterRegistered") // Checks both emits happen
                .withArgs(voter1.address)
                .and.to.emit(veritasVote, "VoterRegistered")
                .withArgs(voter2.address);
            expect(await veritasVote.isRegisteredVoter(voter1.address)).to.be.true;
            expect(await veritasVote.isRegisteredVoter(voter2.address)).to.be.true;
            expect(await veritasVote.getRegisteredVoterCount()).to.equal(2);
        });


        it("Should prevent registering the zero address", async function () {
            const { veritasVote, owner } = await loadFixture(deployVeritasVoteFixture);
            await expect(
                veritasVote.connect(owner).registerVoter(ethers.constants.AddressZero)
            ).to.be.revertedWith("VeritasVote: Cannot register the zero address.");
        });

        it("Should prevent non-owner from registering a voter", async function () {
            const { veritasVote, voter1, nonVoter } = await loadFixture(deployVeritasVoteFixture);
            await expect(
                veritasVote.connect(nonVoter).registerVoter(voter1.address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should prevent registering an already registered voter", async function () {
            const { veritasVote, owner, voter1 } = await loadFixture(deployVeritasVoteFixture);
            await veritasVote.connect(owner).registerVoter(voter1.address); // First registration
            await expect(
                veritasVote.connect(owner).registerVoter(voter1.address) // Second attempt
            ).to.be.revertedWith("VeritasVote: Voter already registered.");
        });

        it("Owner should be able to remove a registered voter", async function () {
            const { veritasVote, owner, voter1 } = await loadFixture(deployVeritasVoteFixture);
            await veritasVote.connect(owner).registerVoter(voter1.address);
            expect(await veritasVote.isRegisteredVoter(voter1.address)).to.be.true; // Verify registered

            await expect(veritasVote.connect(owner).removeVoter(voter1.address))
                .to.emit(veritasVote, "VoterRemoved")
                .withArgs(voter1.address);
            expect(await veritasVote.isRegisteredVoter(voter1.address)).to.be.false; // Verify removed
        });

        it("Should prevent removing a non-registered voter", async function () {
            const { veritasVote, owner, nonVoter } = await loadFixture(deployVeritasVoteFixture);
            await expect(
                veritasVote.connect(owner).removeVoter(nonVoter.address)
            ).to.be.revertedWith("VeritasVote: Voter not found.");
        });

         it("Should prevent non-owner from removing a voter", async function () {
            const { veritasVote, owner, voter1, nonVoter } = await loadFixture(deployVeritasVoteFixture);
            await veritasVote.connect(owner).registerVoter(voter1.address);
            await expect(
                veritasVote.connect(nonVoter).removeVoter(voter1.address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should return the correct voter count and list", async function() {
             const { veritasVote, owner, voter1, voter2 } = await loadFixture(deployVeritasVoteFixture);
             expect(await veritasVote.getRegisteredVoterCount()).to.equal(0);
             await veritasVote.connect(owner).registerVoter(voter1.address);
             await veritasVote.connect(owner).registerVoter(voter2.address);
             expect(await veritasVote.getRegisteredVoterCount()).to.equal(2);
             const voters = await veritasVote.getRegisteredVoters();
             // Use unorderedDeepMembers for set comparison, as order might not be guaranteed
             expect(voters).to.have.deep.members([voter1.address, voter2.address]);
        });
    });

    // Test Suite for Election Management
    describe("Election Management", function () {
        // Setup fixture specific for election tests
        async function electionSetupFixture() {
            const base = await loadFixture(deployVeritasVoteFixture);
            const { veritasVote, owner, voter1, voter2 } = base;

            // Register voters
            await veritasVote.connect(owner).registerVoter(voter1.address);
            await veritasVote.connect(owner).registerVoter(voter2.address);

            // Define election details
            const electionName = "Test Election";
            const proposalDescs = ["Proposal A", "Proposal B", "Proposal C"];
            const startTime = (await ethers.provider.getBlock("latest")).timestamp + 60; // Starts in 1 minute
            const endTime = startTime + 3600; // Ends 1 hour after start

            return { ...base, electionName, proposalDescs, startTime, endTime };
        }

        it("Owner should be able to create an election", async function () {
            const { veritasVote, owner, electionName, proposalDescs, startTime, endTime } = await loadFixture(electionSetupFixture);

            const expectedElectionId = 1;
            await expect(veritasVote.connect(owner).createElection(electionName, startTime, endTime, proposalDescs))
                .to.emit(veritasVote, "ElectionCreated")
                .withArgs(expectedElectionId, electionName, startTime, endTime);

             // Check details of the created election
             const details = await veritasVote.getElectionDetails(expectedElectionId);
             expect(details.id).to.equal(expectedElectionId);
             expect(details.name).to.equal(electionName);
             expect(details.startTime).to.equal(startTime);
             expect(details.endTime).to.equal(endTime);
             expect(details.status).to.equal(0); // 0 = Pending
             expect(details.totalVotesCast).to.equal(0);

             const proposals = await veritasVote.getElectionProposals(expectedElectionId);
             expect(proposals.length).to.equal(proposalDescs.length);
             expect(proposals[0].description).to.equal(proposalDescs[0]);
             expect(proposals[0].id).to.equal(1); // Proposal IDs start from 1
             expect(proposals[1].id).to.equal(2);
             expect(proposals[2].id).to.equal(3);
        });

         it("Should prevent creating an election with end time before start time", async function () {
            const { veritasVote, owner, electionName, proposalDescs, startTime } = await loadFixture(electionSetupFixture);
            const invalidEndTime = startTime - 100; // End time before start time
             await expect(veritasVote.connect(owner).createElection(electionName, startTime, invalidEndTime, proposalDescs))
                .to.be.revertedWith("VeritasVote: End time must be after start time.");
        });

        it("Should prevent creating an election with start time in the past", async function () {
            const { veritasVote, owner, electionName, proposalDescs, endTime } = await loadFixture(electionSetupFixture);
            const pastStartTime = (await ethers.provider.getBlock("latest")).timestamp - 100; // In the past
             await expect(veritasVote.connect(owner).createElection(electionName, pastStartTime, endTime, proposalDescs))
                .to.be.revertedWith("VeritasVote: Start time must be in the future.");
        });

         it("Should prevent creating an election with less than two proposals", async function () {
            const { veritasVote, owner, electionName, startTime, endTime } = await loadFixture(electionSetupFixture);
            const singleProposal = ["Only One Option"];
             await expect(veritasVote.connect(owner).createElection(electionName, startTime, endTime, singleProposal))
                .to.be.revertedWith("VeritasVote: Election needs at least two proposals.");
        });


         it("Should prevent non-owner from creating an election", async function () {
             const { veritasVote, nonVoter, electionName, proposalDescs, startTime, endTime } = await loadFixture(electionSetupFixture);
              await expect(veritasVote.connect(nonVoter).createElection(electionName, startTime, endTime, proposalDescs))
                .to.be.revertedWith("Ownable: caller is not the owner");
        });


         it("Owner should be able to start a pending election after start time", async function () {
             const { veritasVote, owner, electionName, proposalDescs, startTime, endTime } = await loadFixture(electionSetupFixture);
             const electionId = 1;
             await veritasVote.connect(owner).createElection(electionName, startTime, endTime, proposalDescs);

             // Move time forward past the start time
             await ethers.provider.send("evm_increaseTime", [61]); // Increase time by 61 seconds
             await ethers.provider.send("evm_mine", []);          // Mine a new block

              await expect(veritasVote.connect(owner).startElection(electionId))
                .to.emit(veritasVote, "ElectionStatusChanged")
                .withArgs(electionId, 1); // 1 = Active

             const details = await veritasVote.getElectionDetails(electionId);
             expect(details.status).to.equal(1); // Active
        });

        it("Should prevent starting an election before its start time", async function () {
             const { veritasVote, owner, electionName, proposalDescs, startTime, endTime } = await loadFixture(electionSetupFixture);
             const electionId = 1;
             await veritasVote.connect(owner).createElection(electionName, startTime, endTime, proposalDescs);

             // Time has NOT moved forward yet
             await expect(veritasVote.connect(owner).startElection(electionId))
                .to.be.revertedWith("VeritasVote: Cannot start before the designated start time.");
        });


        it("Should prevent starting an already active or closed election", async function () {
             const { veritasVote, owner, electionName, proposalDescs, startTime, endTime } = await loadFixture(electionSetupFixture);
             const electionId = 1;
             await veritasVote.connect(owner).createElection(electionName, startTime, endTime, proposalDescs);
             // Move time forward past start time and start it
             await ethers.provider.send("evm_increaseTime", [61]);
             await ethers.provider.send("evm_mine", []);
             await veritasVote.connect(owner).startElection(electionId);

             // Try starting again
             await expect(veritasVote.connect(owner).startElection(electionId))
                .to.be.revertedWith("VeritasVote: Election is not in Pending state.");

              // Move time forward past end time and close it
             await ethers.provider.send("evm_increaseTime", [3601]); // Past end time
             await ethers.provider.send("evm_mine", []);
             await veritasVote.connect(owner).endElection(electionId); // Owner ends it

             // Try starting the closed election
             await expect(veritasVote.connect(owner).startElection(electionId))
                 .to.be.revertedWith("VeritasVote: Election is not in Pending state.");

        });

        it("Owner should be able to end an active election after end time", async function () {
             const { veritasVote, owner, electionName, proposalDescs, startTime, endTime } = await loadFixture(electionSetupFixture);
             const electionId = 1;
             await veritasVote.connect(owner).createElection(electionName, startTime, endTime, proposalDescs);
             // Start election
             await ethers.provider.send("evm_increaseTime", [61]);
             await ethers.provider.send("evm_mine", []);
             await veritasVote.connect(owner).startElection(electionId);

              // Move time forward past the end time
             await ethers.provider.send("evm_increaseTime", [3601]); // 1 hour + 1 second
             await ethers.provider.send("evm_mine", []);          // Mine a new block

              await expect(veritasVote.connect(owner).endElection(electionId))
                .to.emit(veritasVote, "ElectionStatusChanged")
                .withArgs(electionId, 2); // 2 = Closed

             const details = await veritasVote.getElectionDetails(electionId);
             expect(details.status).to.equal(2); // Closed
        });


        it("Should prevent ending an election before its end time", async function () {
             const { veritasVote, owner, electionName, proposalDescs, startTime, endTime } = await loadFixture(electionSetupFixture);
             const electionId = 1;
             await veritasVote.connect(owner).createElection(electionName, startTime, endTime, proposalDescs);
             // Start election
             await ethers.provider.send("evm_increaseTime", [61]);
             await ethers.provider.send("evm_mine", []);
             await veritasVote.connect(owner).startElection(electionId);

             // Time has NOT reached the end time yet
             await expect(veritasVote.connect(owner).endElection(electionId))
                .to.be.revertedWith("VeritasVote: Cannot end election before its end time.");
        });

        it("Should prevent ending an election that is not active", async function () {
            const { veritasVote, owner, electionName, proposalDescs, startTime, endTime } = await loadFixture(electionSetupFixture);
             const electionId = 1;
             await veritasVote.connect(owner).createElection(electionName, startTime, endTime, proposalDescs);
             // Election is still Pending

             // Move time forward past the end time (even though not started)
             await ethers.provider.send("evm_increaseTime", [3700]);
             await ethers.provider.send("evm_mine", []);

             await expect(veritasVote.connect(owner).endElection(electionId))
                .to.be.revertedWith("VeritasVote: Election is not currently active.");
        });

        it("getTotalElections should return the correct count", async function() {
            const { veritasVote, owner, electionName, proposalDescs, startTime, endTime } = await loadFixture(electionSetupFixture);
            expect(await veritasVote.getTotalElections()).to.equal(0);
            await veritasVote.connect(owner).createElection(electionName, startTime, endTime, proposalDescs);
            expect(await veritasVote.getTotalElections()).to.equal(1);
            const startTime2 = startTime + 7200; // Another future time
            const endTime2 = startTime2 + 3600;
             await veritasVote.connect(owner).createElection("Second Election", startTime2, endTime2, ["Opt X", "Opt Y"]);
             expect(await veritasVote.getTotalElections()).to.equal(2);
        });
    });

    // Test Suite for Voting Process
    describe("Voting Process", function () {
        // Setup fixture with an active election
        async function activeElectionFixture() {
            const base = await loadFixture(electionSetupFixture); // Uses previous fixture
            const { veritasVote, owner, electionName, proposalDescs, startTime, endTime, voter1, voter2, nonVoter } = base;
            const electionId = 1;

            // Create the election
            await veritasVote.connect(owner).createElection(electionName, startTime, endTime, proposalDescs);

             // Start the election (after moving time)
            await ethers.provider.send("evm_increaseTime", [61]); // Move past start time
            await ethers.provider.send("evm_mine", []);
            await veritasVote.connect(owner).startElection(electionId);

            return { ...base, electionId }; // Pass electionId along
        }

        it("Registered voter should be able to cast a vote", async function () {
            const { veritasVote, voter1, electionId } = await loadFixture(activeElectionFixture);
            const proposalIdToVote = 1; // Vote for Proposal A

            await expect(veritasVote.connect(voter1).castVote(electionId, proposalIdToVote))
                .to.emit(veritasVote, "VoteCast")
                .withArgs(voter1.address, electionId, proposalIdToVote);

            // Verify vote count
            const proposals = await veritasVote.getElectionProposals(electionId);
            expect(proposals[0].voteCount).to.equal(1); // Proposal A (index 0) should have 1 vote
            expect(proposals[1].voteCount).to.equal(0); // Proposal B (index 1) should have 0 votes

             // Verify voter's choice is recorded
            expect(await veritasVote.hasVoted(voter1.address, electionId)).to.be.true;
            expect(await veritasVote.getVoteChoice(voter1.address, electionId)).to.equal(proposalIdToVote);

            // Verify total votes cast
            const details = await veritasVote.getElectionDetails(electionId);
            expect(details.totalVotesCast).to.equal(1);
        });


        it("Should prevent non-registered user from voting", async function () {
            const { veritasVote, nonVoter, electionId } = await loadFixture(activeElectionFixture);
            const proposalIdToVote = 1;
            await expect(veritasVote.connect(nonVoter).castVote(electionId, proposalIdToVote))
                .to.be.revertedWith("VeritasVote: Caller is not a registered voter.");
        });


        it("Should prevent voting in a non-existent election", async function () {
            const { veritasVote, voter1 } = await loadFixture(activeElectionFixture);
            const nonExistentElectionId = 999;
            const proposalIdToVote = 1;
            await expect(veritasVote.connect(voter1).castVote(nonExistentElectionId, proposalIdToVote))
                .to.be.revertedWith("VeritasVote: Election does not exist.");
        });


        it("Should prevent voting in a pending election", async function () {
             const { veritasVote, owner, voter1, electionName, proposalDescs, startTime, endTime } = await loadFixture(electionSetupFixture);
             const electionId = 1;
             await veritasVote.connect(owner).createElection(electionName, startTime, endTime, proposalDescs);
             // Election is pending, time NOT moved forward

             const proposalIdToVote = 1;
             await expect(veritasVote.connect(voter1).castVote(electionId, proposalIdToVote))
                .to.be.revertedWith("VeritasVote: Election is not active.");
        });

         it("Should prevent voting before the election start time", async function () {
             const { veritasVote, owner, voter1, electionName, proposalDescs, startTime, endTime } = await loadFixture(electionSetupFixture);
             const electionId = 1;
             await veritasVote.connect(owner).createElection(electionName, startTime, endTime, proposalDescs);

             // Election created, but time hasn't reached startTime yet
             const proposalIdToVote = 1;
             await expect(veritasVote.connect(voter1).castVote(electionId, proposalIdToVote))
                .to.be.revertedWith("VeritasVote: Election is not active."); // Also caught by this initially
             // Could refine modifier message for clearer distinction between Pending and Not Started Yet

            //Let's start it Manually, but still BEFORE start time (should fail at the internal time check)
             await expect(veritasVote.connect(owner).startElection(electionId)).to.be.revertedWith("VeritasVote: Cannot start before the designated start time.");

             // We cannot even start it yet, so the vote check `electionIsActive` will fail due to time check.
              await expect(veritasVote.connect(voter1).castVote(electionId, proposalIdToVote))
                .to.be.revertedWith("VeritasVote: Election is not active.");
        });


        it("Should prevent voting after the election end time", async function () {
             const { veritasVote, owner, voter1, electionId, endTime } = await loadFixture(activeElectionFixture);
             const proposalIdToVote = 1;

              // Move time forward past the end time
             await ethers.provider.send("evm_increaseTime", [3601]); // Past end time
             await ethers.provider.send("evm_mine", []);

              await expect(veritasVote.connect(voter1).castVote(electionId, proposalIdToVote))
                .to.be.revertedWith("VeritasVote: Voting period has ended."); // Checked by electionIsActive

            // Even if owner closes it
             await veritasVote.connect(owner).endElection(electionId);
              await expect(veritasVote.connect(voter1).castVote(electionId, proposalIdToVote))
                .to.be.revertedWith("VeritasVote: Election is not active."); // Checked by electionIsActive first

        });

        it("Should prevent a voter from voting twice in the same election", async function () {
             const { veritasVote, voter1, electionId } = await loadFixture(activeElectionFixture);
             const proposalIdToVote1 = 1;
             const proposalIdToVote2 = 2;

             // First vote
             await veritasVote.connect(voter1).castVote(electionId, proposalIdToVote1);
             expect(await veritasVote.hasVoted(voter1.address, electionId)).to.be.true;

             // Second vote attempt
             await expect(veritasVote.connect(voter1).castVote(electionId, proposalIdToVote2))
                .to.be.revertedWith("VeritasVote: Voter has already cast a vote in this election.");

            // Verify original vote is still counted
            const proposals = await veritasVote.getElectionProposals(electionId);
            expect(proposals[0].voteCount).to.equal(1);
            expect(proposals[1].voteCount).to.equal(0); // Second proposal vote shouldn't count
            const details = await veritasVote.getElectionDetails(electionId);
            expect(details.totalVotesCast).to.equal(1); // Only one vote counted
        });


        it("Should prevent voting for an invalid proposal ID", async function () {
            const { veritasVote, voter1, electionId, proposalDescs } = await loadFixture(activeElectionFixture);
            const invalidProposalId = proposalDescs.length + 1; // ID higher than available proposals

            await expect(veritasVote.connect(voter1).castVote(electionId, invalidProposalId))
                .to.be.revertedWith("VeritasVote: Invalid proposal ID for this election.");

             const zeroProposalId = 0; // ID 0 is never valid (IDs start from 1)
              await expect(veritasVote.connect(voter1).castVote(electionId, zeroProposalId))
                .to.be.revertedWith("VeritasVote: Invalid proposal ID for this election.");
        });

         it("Should allow multiple voters to vote correctly", async function () {
            const { veritasVote, voter1, voter2, electionId } = await loadFixture(activeElectionFixture);
            const proposalId1 = 1; // Voter 1 votes for Prop A
            const proposalId2 = 2; // Voter 2 votes for Prop B

            await veritasVote.connect(voter1).castVote(electionId, proposalId1);
            await veritasVote.connect(voter2).castVote(electionId, proposalId2);

             // Verify vote counts
            const proposals = await veritasVote.getElectionProposals(electionId);
            expect(proposals[0].voteCount).to.equal(1); // Prop A
            expect(proposals[1].voteCount).to.equal(1); // Prop B
            expect(proposals[2].voteCount).to.equal(0); // Prop C

             // Verify total votes
             const details = await veritasVote.getElectionDetails(electionId);
            expect(details.totalVotesCast).to.equal(2);

            // Verify individual votes
             expect(await veritasVote.getVoteChoice(voter1.address, electionId)).to.equal(proposalId1);
             expect(await veritasVote.getVoteChoice(voter2.address, electionId)).to.equal(proposalId2);

        });

    });

     // Test Suite for Results and Winning Proposal
    describe("Results and Winning Proposal", function () {
        // Fixture with a closed election and some votes
        async function closedElectionWithVotesFixture() {
            const base = await loadFixture(activeElectionFixture);
            const { veritasVote, owner, voter1, voter2, nonVoter, electionId, endTime } = base;
            // Assuming proposal IDs 1, 2, 3 exist

            // voter1 votes for proposal 1
            await veritasVote.connect(voter1).castVote(electionId, 1);
             // voter2 votes for proposal 1
            await veritasVote.connect(voter2).castVote(electionId, 1);
             // (nonVoter cannot vote)

            // Move time past end time and close election
            await ethers.provider.send("evm_increaseTime", [3601]); // Past end time
            await ethers.provider.send("evm_mine", []);
            await veritasVote.connect(owner).endElection(electionId);

            return base; // Contains electionId and contract instance
        }


         it("Should return correct proposals with vote counts after closing", async function () {
            const { veritasVote, electionId } = await loadFixture(closedElectionWithVotesFixture);

             const proposals = await veritasVote.getElectionProposals(electionId);
             expect(proposals.length).to.equal(3);
             expect(proposals[0].id).to.equal(1);
             expect(proposals[0].voteCount).to.equal(2); // Prop A received 2 votes
             expect(proposals[1].id).to.equal(2);
             expect(proposals[1].voteCount).to.equal(0); // Prop B received 0 votes
             expect(proposals[2].id).to.equal(3);
             expect(proposals[2].voteCount).to.equal(0); // Prop C received 0 votes

             const details = await veritasVote.getElectionDetails(electionId);
             expect(details.totalVotesCast).to.equal(2);
             expect(details.status).to.equal(2); // Closed
        });

         it("Should correctly identify the winning proposal (single winner)", async function () {
             const { veritasVote, electionId } = await loadFixture(closedElectionWithVotesFixture);

             const winningIds = await veritasVote.getWinningProposal(electionId);
             expect(winningIds.length).to.equal(1);
             expect(winningIds[0]).to.equal(1); // Proposal 1 should be the winner
        });

         it("Should correctly identify winning proposals in case of a tie", async function () {
             const base = await loadFixture(activeElectionFixture);
             const { veritasVote, owner, voter1, voter2, nonVoter, electionId, endTime } = base;
             const voter3 = nonVoter; // Rename for clarity, assuming nonVoter isn't used otherwise

            // Register voter3
            await veritasVote.connect(owner).registerVoter(voter3.address);

            // voter1 votes for proposal 1
            await veritasVote.connect(voter1).castVote(electionId, 1);
            // voter2 votes for proposal 2
            await veritasVote.connect(voter2).castVote(electionId, 2);
             // voter3 votes for proposal 1
             await veritasVote.connect(voter3).castVote(electionId, 1);

             // Close election
             await ethers.provider.send("evm_increaseTime", [3601]);
             await ethers.provider.send("evm_mine", []);
             await veritasVote.connect(owner).endElection(electionId);

             // Results: Prop 1: 2 votes, Prop 2: 1 vote, Prop 3: 0 votes
             // Winner should be Proposal 1
              const winningIdsSingle = await veritasVote.getWinningProposal(electionId);
             expect(winningIdsSingle.length).to.equal(1);
             expect(winningIdsSingle[0]).to.equal(1);


            // --- Test a tie scenario ---
             // Create a NEW election for the tie test
             const electionNameTie = "Tie Election";
             const proposalDescsTie = ["Tie A", "Tie B", "Tie C"];
             const startTimeTie = (await ethers.provider.getBlock("latest")).timestamp + 10;
             const endTimeTie = startTimeTie + 100;
             const electionIdTie = 2; // Next ID
             await veritasVote.connect(owner).createElection(electionNameTie, startTimeTie, endTimeTie, proposalDescsTie);
             await ethers.provider.send("evm_increaseTime", [11]);
             await ethers.provider.send("evm_mine", []);
             await veritasVote.connect(owner).startElection(electionIdTie);

              // Votes: voter1 -> Prop 1, voter2 -> Prop 2
              await veritasVote.connect(voter1).castVote(electionIdTie, 1);
              await veritasVote.connect(voter2).castVote(electionIdTie, 2);

              // Close the tie election
              await ethers.provider.send("evm_increaseTime", [101]);
              await ethers.provider.send("evm_mine", []);
              await veritasVote.connect(owner).endElection(electionIdTie);

               // Results: Prop 1: 1 vote, Prop 2: 1 vote, Prop 3: 0 votes -> Tie!
               const winningIdsTie = await veritasVote.getWinningProposal(electionIdTie);
               expect(winningIdsTie.length).to.equal(2); // Expect two winners
                // Check that the winning IDs are 1 and 2 (order doesn't matter)
               expect(winningIdsTie).to.have.deep.members([ethers.BigNumber.from(1), ethers.BigNumber.from(2)]);

        });

         it("Should prevent getting winner for an election that is not closed", async function () {
            const { veritasVote, electionId } = await loadFixture(activeElectionFixture); // Election is active
            await expect(veritasVote.getWinningProposal(electionId))
                .to.be.revertedWith("VeritasVote: Election is not closed yet.");
        });

        it("Should prevent getting winner for a closed election with no votes", async function () {
            const { veritasVote, owner, electionName, proposalDescs, startTime, endTime } = await loadFixture(electionSetupFixture);
            const electionId = 1;
            await veritasVote.connect(owner).createElection(electionName, startTime, endTime, proposalDescs);

            // Move time, start and immediately close without votes
             await ethers.provider.send("evm_increaseTime", [startTime - (await ethers.provider.getBlock("latest")).timestamp + 1]); // Go past start
             await ethers.provider.send("evm_mine", []);
             await veritasVote.connect(owner).startElection(electionId);

            await ethers.provider.send("evm_increaseTime", [endTime - startTime + 1]); // Go past end
            await ethers.provider.send("evm_mine", []);
             await veritasVote.connect(owner).endElection(electionId);


            await expect(veritasVote.getWinningProposal(electionId))
                .to.be.revertedWith("VeritasVote: No votes were cast in this election.");
        });
    });

     // Test Suite for Access Control and Security
    describe("Access Control & Security", function () {
         it("Should prevent reentrancy attack on castVote", async function () {
            // Scenario: Create a malicious contract that tries to call castVote again from its fallback/receive function
            const { veritasVote, owner, voter1, electionId } = await loadFixture(activeElectionFixture);

            // Deploy a malicious contract
             const MaliciousVoter = await ethers.getContractFactory("MaliciousVoter");
             const maliciousContract = await MaliciousVoter.deploy(veritasVote.address);
             await maliciousContract.deployed();

            // Register the malicious contract as a voter
            await veritasVote.connect(owner).registerVoter(maliciousContract.address);

            // Set the target election and proposal in the malicious contract
             const proposalIdToVote = 1;
             await maliciousContract.setTarget(electionId, proposalIdToVote);

              // Trigger the attack: call the malicious contract's attack function
              // This should revert because of the nonReentrant modifier in castVote
              await expect(
                  maliciousContract.attack()
              ).to.be.revertedWith("ReentrancyGuard: reentrant call");

             // Verify no vote was actually recorded (or only the first if reentrancy guard failed)
             const proposals = await veritasVote.getElectionProposals(electionId);
             expect(proposals[0].voteCount).to.equal(0); // Should remain 0 if reentrancy prevented double voting

             // Note: You'll need a simple MaliciousVoter contract for this test:
             /*
             // contracts/test/MaliciousVoter.sol
             pragma solidity ^0.8.18;
             import "../VeritasVote.sol"; // Adjust path if needed

             contract MaliciousVoter {
                 VeritasVote public targetVoteContract;
                 uint256 public electionId;
                 uint256 public proposalId;
                 uint public callCount = 0; // To ensure it actually tries to re-enter

                 constructor(address _voteContractAddress) {
                     targetVoteContract = VeritasVote(_voteContractAddress);
                 }

                 function setTarget(uint256 _electionId, uint256 _proposalId) external {
                     electionId = _electionId;
                     proposalId = _proposalId;
                 }

                 function attack() external {
                    callCount = 0; // Reset before attack
                    targetVoteContract.castVote(electionId, proposalId);
                 }

                 // Fallback function to attempt reentrancy
                 // NOTE: Simple fallback may not receive enough gas. A specific callback function
                 // triggered by an event *might* be needed for a more robust test, but
                 // this demonstrates the principle against direct reentrancy.
                  fallback() external payable {
                    // In a real attack, this might call castVote again
                     callCount++;
                     if (callCount < 2) { // Prevent infinite loops
                        try targetVoteContract.castVote(electionId, proposalId) {} catch {} // Attempt reentrant call
                    }
                 }
                 receive() external payable {
                    // In a real attack, this might call castVote again
                    callCount++;
                     if (callCount < 2) { // Prevent infinite loops
                       try targetVoteContract.castVote(electionId, proposalId) {} catch {} // Attempt reentrant call
                    }
                 }
             }
             */
         });

        // Add more tests for other owner functions if needed (e.g., transferring ownership)
         it("Owner should be able to transfer ownership", async function() {
             const { veritasVote, owner, voter1 } = await loadFixture(deployVeritasVoteFixture);
             await expect(veritasVote.connect(owner).transferOwnership(voter1.address))
                .to.emit(veritasVote, "OwnershipTransferred")
                .withArgs(owner.address, voter1.address);
             expect(await veritasVote.owner()).to.equal(voter1.address);
         });

          it("Non-owner cannot transfer ownership", async function() {
             const { veritasVote, nonVoter, voter1 } = await loadFixture(deployVeritasVoteFixture);
             await expect(veritasVote.connect(nonVoter).transferOwnership(voter1.address))
                 .to.be.revertedWith("Ownable: caller is not the owner");
         });
    });


});
/*
Note: For the Reentrancy test, you would need to create the simple `MaliciousVoter.sol` contract shown in the comments within 
the test file and place it in your `contracts` or a `contracts/test` folder.
*/