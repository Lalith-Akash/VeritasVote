// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

// Using OpenZeppelin contracts for standard, secure implementations
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol"; // For managing voters

/**
 * @title VeritasVote
 * @author Your Name // <-- Put your name here!
 * @notice A secure and transparent decentralized voting system.
 * @dev This contract manages elections, voter registration, and vote casting.
 *      It uses OpenZeppelin's Ownable for access control, ReentrancyGuard for security,
 *      and EnumerableSet for efficient voter management.
 */
contract VeritasVote is Ownable, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;

    // --- State Variables ---

    // Keep track of all registered voters efficiently
    EnumerableSet.AddressSet private registeredVoters;

    // Simple counter for generating unique election IDs
    uint256 private nextElectionId;

    // Mapping election IDs to their details
    mapping(uint256 => Election) public elections;

    // Mapping voter addresses to the elections they have voted in (and their choice)
    // Helps prevent double voting per election
    // structure: mapping(voterAddress => mapping(electionId => proposalId))
    mapping(address => mapping(uint256 => uint256)) private votes;

    // --- Structs ---

    // Structure to hold details about a single proposal within an election
    struct Proposal {
        uint256 id;
        string description; // What the proposal is about
        uint256 voteCount; // Tally of votes for this proposal
    }

    // Structure to represent an election
    struct Election {
        uint256 id;
        string name; // Name of the election (e.g., "Board Member Election 2024")
        uint256 startTime; // Timestamp when voting begins (Unix timestamp)
        uint256 endTime; // Timestamp when voting ends (Unix timestamp)
        ElectionStatus status; // Current state of the election
        Proposal[] proposals; // List of proposals for this election
        mapping(uint256 => bool) proposalExists; // Quick check if a proposal ID is valid
        uint256 totalVotesCast; // Total votes cast in this election
    }

    // --- Enums ---

    // Defines the possible states of an election
    enum ElectionStatus {
        Pending, // Not yet started
        Active,  // Currently running
        Closed   // Voting has finished
    }

    // --- Events ---

    event VoterRegistered(address indexed voterAddress);
    event VoterRemoved(address indexed voterAddress);
    event ElectionCreated(
        uint256 indexed electionId,
        string name,
        uint256 startTime,
        uint256 endTime
    );
    event ElectionStatusChanged(
        uint256 indexed electionId,
        ElectionStatus newStatus
    );
    event VoteCast(
        address indexed voter,
        uint256 indexed electionId,
        uint256 indexed proposalId
    );

    // --- Modifiers ---

    /**
     * @dev Ensures the sender is a registered voter.
     */
    modifier onlyRegisteredVoter() {
        require(
            isRegisteredVoter(msg.sender),
            "VeritasVote: Caller is not a registered voter."
        );
        _;
    }

    /**
     * @dev Checks if an election exists.
     */
    modifier electionExists(uint256 _electionId) {
        require(
            elections[_electionId].id == _electionId,
            "VeritasVote: Election does not exist."
        );
        _;
    }

    /**
     * @dev Checks if the election is in the Active state.
     */
    modifier electionIsActive(uint256 _electionId) {
        require(
            elections[_electionId].status == ElectionStatus.Active,
            "VeritasVote: Election is not active."
        );
        require(
            block.timestamp >= elections[_electionId].startTime,
            "VeritasVote: Voting period has not started yet."
        );
        require(
            block.timestamp < elections[_electionId].endTime,
            "VeritasVote: Voting period has ended."
        );
        _;
    }

    // --- Constructor ---

    /**
     * @dev Sets the contract deployer as the initial owner.
     *      Initializes the first election ID to 1.
     */
    constructor() {
        nextElectionId = 1; // Start election IDs from 1 for clarity
    }

    // --- Owner Functions (Administration) ---

    /**
     * @notice Registers a new voter. Only the owner can call this.
     * @param _voterAddress The address of the voter to register.
     * @dev Emits a {VoterRegistered} event.
     */
    function registerVoter(address _voterAddress) public onlyOwner {
        require(
            _voterAddress != address(0),
            "VeritasVote: Cannot register the zero address."
        );
        require(
            registeredVoters.add(_voterAddress),
            "VeritasVote: Voter already registered."
        );
        emit VoterRegistered(_voterAddress);
    }

     /**
     * @notice Registers multiple voters at once. Only the owner can call this.
     * @param _voterAddresses An array of voter addresses to register.
     * @dev Iterates and calls internal registration logic. Be mindful of gas limits for large arrays.
     */
    function registerVotersBatch(address[] calldata _voterAddresses) public onlyOwner {
        for (uint i = 0; i < _voterAddresses.length; i++) {
            address voter = _voterAddresses[i];
            if (voter != address(0) && !registeredVoters.contains(voter)) {
                 registeredVoters.add(voter);
                 emit VoterRegistered(voter);
            }
            // Consider adding checks/events for already registered or zero addresses if needed
        }
    }

    /**
     * @notice Removes a voter. Only the owner can call this.
     * @param _voterAddress The address of the voter to remove.
     * @dev Emits a {VoterRemoved} event.
     */
    function removeVoter(address _voterAddress) public onlyOwner {
        require(
            registeredVoters.remove(_voterAddress),
            "VeritasVote: Voter not found."
        );
        emit VoterRemoved(_voterAddress);
    }

    /**
     * @notice Creates a new election.
     * @param _name The name or title of the election.
     * @param _startTime The Unix timestamp when voting starts.
     * @param _endTime The Unix timestamp when voting ends. Must be after _startTime.
     * @param _proposalDescriptions A list of descriptions for each proposal.
     * @dev Creates proposals with sequential IDs starting from 1.
     *      Emits an {ElectionCreated} event. The election starts in 'Pending' status.
     */
    function createElection(
        string memory _name,
        uint256 _startTime,
        uint256 _endTime,
        string[] memory _proposalDescriptions
    ) public onlyOwner {
        require(
            _startTime < _endTime,
            "VeritasVote: End time must be after start time."
        );
        require(
            _startTime >= block.timestamp,
            "VeritasVote: Start time must be in the future."
        );
        require(
            _proposalDescriptions.length >= 2,
            "VeritasVote: Election needs at least two proposals."
        );

        uint256 electionId = nextElectionId++;
        Election storage newElection = elections[electionId];
        newElection.id = electionId;
        newElection.name = _name;
        newElection.startTime = _startTime;
        newElection.endTime = _endTime;
        newElection.status = ElectionStatus.Pending; // Start as Pending

        // Create proposals
        for (uint256 i = 0; i < _proposalDescriptions.length; i++) {
            uint256 proposalId = i + 1; // Start proposal IDs from 1
            newElection.proposals.push(
                Proposal({
                    id: proposalId,
                    description: _proposalDescriptions[i],
                    voteCount: 0
                })
            );
            newElection.proposalExists[proposalId] = true;
        }

        emit ElectionCreated(electionId, _name, _startTime, _endTime);
    }

    /**
     * @notice Manually starts an election (if conditions are met).
     * @param _electionId The ID of the election to start.
     * @dev Can only start if the election is Pending and current time is past start time.
     *      Emits {ElectionStatusChanged}.
     */
    function startElection(uint256 _electionId)
        public
        onlyOwner
        electionExists(_electionId)
    {
        Election storage election = elections[_electionId];
        require(
            election.status == ElectionStatus.Pending,
            "VeritasVote: Election is not in Pending state."
        );
        require(
            block.timestamp >= election.startTime,
            "VeritasVote: Cannot start before the designated start time."
        );
         require(
            block.timestamp < election.endTime,
            "VeritasVote: Cannot start after the designated end time."
        );

        election.status = ElectionStatus.Active;
        emit ElectionStatusChanged(_electionId, ElectionStatus.Active);
    }

    /**
     * @notice Manually ends an election.
     * @param _electionId The ID of the election to end.
     * @dev Can end if election is Active and current time is past end time.
     *      Emits {ElectionStatusChanged}.
     */
    function endElection(uint256 _electionId)
        public
        onlyOwner // Or potentially allow anyone if past end time
        electionExists(_electionId)
    {
        Election storage election = elections[_electionId];
        // We might allow ending slightly early if needed, but strict check is safer
        require(
            block.timestamp >= election.endTime,
            "VeritasVote: Cannot end election before its end time."
        );
        require(
            election.status == ElectionStatus.Active,
            "VeritasVote: Election is not currently active."
        );

        election.status = ElectionStatus.Closed;
        emit ElectionStatusChanged(_electionId, ElectionStatus.Closed);
    }


    // --- Voter Functions ---

    /**
     * @notice Allows a registered voter to cast their vote in an active election.
     * @param _electionId The ID of the election to vote in.
     * @param _proposalId The ID of the proposal to vote for.
     * @dev Checks registration, election status, time constraints, and prevents double voting.
     *      Uses {ReentrancyGuard} to prevent reentrancy attacks.
     *      Emits a {VoteCast} event.
     */
    function castVote(uint256 _electionId, uint256 _proposalId)
        public
        nonReentrant // Protect against reentrancy attacks
        onlyRegisteredVoter // Ensure the caller is registered
        electionExists(_electionId) // Ensure the election is valid
        electionIsActive(_electionId) // Ensure the election is currently running and within time bounds
    {
        Election storage election = elections[_electionId];

        // Check if the chosen proposal ID is valid for this election
        require(
            election.proposalExists[_proposalId],
            "VeritasVote: Invalid proposal ID for this election."
        );

        // Check if the voter has already voted in this specific election
        require(
            votes[msg.sender][_electionId] == 0, // 0 indicates not voted (since proposal IDs start from 1)
            "VeritasVote: Voter has already cast a vote in this election."
        );

        // Record the vote
        votes[msg.sender][_electionId] = _proposalId;

        // Increment the vote count for the chosen proposal
        // Find the proposal struct (can be optimized if proposal IDs directly map to array indices)
        bool proposalFound = false;
        for(uint i = 0; i < election.proposals.length; i++){
            if(election.proposals[i].id == _proposalId){
                election.proposals[i].voteCount++;
                proposalFound = true;
                break;
            }
        }
        // This should ideally not happen due to the proposalExists check, but belts and suspenders
        require(proposalFound, "VeritasVote: Internal error - Proposal not found during vote tally.");


        election.totalVotesCast++; // Increment total votes for the election

        // Emit an event to log the vote off-chain
        emit VoteCast(msg.sender, _electionId, _proposalId);
    }

    // --- Public View Functions ---

    /**
     * @notice Checks if a given address is registered to vote.
     * @param _voterAddress The address to check.
     * @return bool True if the address is registered, false otherwise.
     */
    function isRegisteredVoter(address _voterAddress)
        public
        view
        returns (bool)
    {
        return registeredVoters.contains(_voterAddress);
    }

     /**
     * @notice Gets the total number of registered voters.
     * @return uint256 The count of registered voters.
     */
    function getRegisteredVoterCount() public view returns (uint256) {
        return registeredVoters.length();
    }

    /**
     * @notice Gets a list of all registered voter addresses.
     * @dev Be mindful of gas limits if the number of voters is very large.
     *      Consider pagination or off-chain methods for huge lists.
     * @return address[] Array of registered voter addresses.
     */
    function getRegisteredVoters() public view returns (address[] memory) {
        uint256 count = registeredVoters.length();
        address[] memory voters = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            voters[i] = registeredVoters.at(i);
        }
        return voters;
    }

    /**
    * @notice Checks if a voter has already voted in a specific election.
    * @param _voterAddress The address of the voter.
    * @param _electionId The ID of the election.
    * @return bool True if the voter has cast a vote, false otherwise.
    */
    function hasVoted(address _voterAddress, uint256 _electionId)
        public
        view
        electionExists(_electionId) // Ensure election exists
        returns (bool)
    {
        return votes[_voterAddress][_electionId] != 0; // Proposal IDs start at 1, so 0 means not voted
    }

     /**
     * @notice Gets the ID of the proposal the voter chose in a specific election.
     * @param _voterAddress The address of the voter.
     * @param _electionId The ID of the election.
     * @return uint256 The ID of the proposal voted for, or 0 if they haven't voted.
     */
    function getVoteChoice(address _voterAddress, uint256 _electionId)
        public
        view
        electionExists(_electionId)
        returns (uint256)
    {
        return votes[_voterAddress][_electionId];
    }

    /**
     * @notice Retrieves the details of a specific election.
     * @param _electionId The ID of the election.
     * @return Election details (id, name, startTime, endTime, status, totalVotesCast).
     * @dev Does not return proposals to avoid potential stack depth issues; use getElectionProposals.
     */
    function getElectionDetails(uint256 _electionId)
        public
        view
        electionExists(_electionId)
        returns (
            uint256 id,
            string memory name,
            uint256 startTime,
            uint256 endTime,
            ElectionStatus status,
            uint256 totalVotesCast
        )
    {
        Election storage election = elections[_electionId];
        return (
            election.id,
            election.name,
            election.startTime,
            election.endTime,
            election.status,
            election.totalVotesCast
        );
    }

    /**
     * @notice Retrieves the proposals for a specific election.
     * @param _electionId The ID of the election.
     * @return Proposal[] An array containing the details of each proposal.
     * @dev Be cautious with large numbers of proposals due to potential gas costs in decoding the result off-chain.
     */
    function getElectionProposals(uint256 _electionId)
        public
        view
        electionExists(_electionId)
        returns (Proposal[] memory)
    {
        return elections[_electionId].proposals;
    }

     /**
     * @notice Gets the total number of elections created.
     * @return uint256 The next election ID, which indicates the total count + 1 (since IDs start from 1). Returns 0 if no elections created yet.
     */
    function getTotalElections() public view returns (uint256) {
        // If nextElectionId is 1, it means no elections have been created yet.
        return nextElectionId > 0 ? nextElectionId - 1 : 0;
    }

    /**
    * @notice Get the ID of the winning proposal(s) for a closed election.
    * @param _electionId The ID of the election.
    * @return uint256[] An array of winning proposal IDs (can be multiple in case of a tie). Returns empty array if election not closed or no votes.
    */
    function getWinningProposal(uint256 _electionId)
        public
        view
        electionExists(_electionId)
        returns (uint256[] memory)
    {
        Election storage election = elections[_electionId];
        require(election.status == ElectionStatus.Closed, "VeritasVote: Election is not closed yet.");
        require(election.totalVotesCast > 0, "VeritasVote: No votes were cast in this election.");

        uint256 highestVoteCount = 0;
        uint256 winnerCount = 0; // How many winners (for tie detection)

        // First pass: find the highest vote count
        for (uint i = 0; i < election.proposals.length; i++) {
            if (election.proposals[i].voteCount > highestVoteCount) {
                highestVoteCount = election.proposals[i].voteCount;
                winnerCount = 1; // Reset winner count
            } else if (election.proposals[i].voteCount == highestVoteCount) {
                winnerCount++; // Found another potential winner (tie)
            }
        }

         // If highestVoteCount is still 0 (although checked earlier), return empty
         if (highestVoteCount == 0) {
            return new uint256[](0);
         }


        // Second pass: collect all winners with the highest vote count
        uint256[] memory winningProposalIds = new uint256[](winnerCount);
        uint256 currentIndex = 0;
        for (uint i = 0; i < election.proposals.length; i++) {
            if (election.proposals[i].voteCount == highestVoteCount) {
                winningProposalIds[currentIndex] = election.proposals[i].id;
                currentIndex++;
            }
        }

        return winningProposalIds;
    }

    // --- Helper Functions (Internal/Private) ---

    // The check function is now public `isRegisteredVoter`

    // --- Fallback Function ---

    // Adding a basic receive function to accept Ether if needed, though not used by core logic.
    // receive() external payable {}

    // A fallback function in case someone sends data to the contract without matching a function signature.
    // fallback() external payable {}
}