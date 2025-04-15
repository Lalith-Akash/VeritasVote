import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import VeritasVoteABI from './artifacts/contracts/VeritasVote.sol/VeritasVote.json'; // Adjust path
import './App.css'; 

// ---- IMPORTANT: Replace with your Deployed Contract Address ----
const VERITAS_VOTE_CONTRACT_ADDRESS = "YOUR_DEPLOYED_CONTRACT_ADDRESS_HERE";
// ---------------------------------------------------------------

// --- Helper Enum for Transaction Status ---
const TxStatus = {
  Idle: 'Idle',
  Sending: 'Sending',
  Mining: 'Mining',
  Success: 'Success',
  Error: 'Error',
};

function App() {
  // --- Wallet & Contract State ---
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState(null);
  const [network, setNetwork] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  // --- UI State ---
  const [globalLoading, setGlobalLoading] = useState(false); // For initial load, fetching lists
  const [txStatus, setTxStatus] = useState(TxStatus.Idle);
  const [txMessage, setTxMessage] = useState(''); // More specific feedback during tx
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // --- Admin Form State ---
  const [voterAddressToAdd, setVoterAddressToAdd] = useState('');
  const [electionName, setElectionName] = useState('');
  const [proposalsInput, setProposalsInput] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // --- Election Data State ---
  const [elections, setElections] = useState([]);
  const [selectedElectionId, setSelectedElectionId] = useState('');
  const [selectedElectionDetails, setSelectedElectionDetails] = useState(null);
  const [selectedElectionProposals, setSelectedElectionProposals] = useState([]);
  const [selectedProposalIdToVote, setSelectedProposalIdToVote] = useState('');
  const [hasVotedStatus, setHasVotedStatus] = useState(null);
  const [voterChoice, setVoterChoice] = useState(null);

  // ---- Helper Functions ----
  const clearMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
    setTxMessage('');
  };

  const handleTx = async (txPromise, successMsgPrefix) => {
    clearMessages();
    setTxStatus(TxStatus.Sending);
    setTxMessage("Sending transaction... please check your wallet.");
    try {
      const tx = await txPromise;
      setTxStatus(TxStatus.Mining);
      setTxMessage(`Transaction sent (${tx.hash.substring(0,10)}...). Waiting for confirmation...`);
      await tx.wait(1); // Wait for 1 confirmation
      setTxStatus(TxStatus.Success);
      setSuccessMessage(`${successMsgPrefix} successful! (Tx: ${tx.hash.substring(0,10)}...)`);
      setTxMessage(''); // Clear tx message on final success
      return true; // Indicate success
    } catch (error) {
      console.error("Transaction error:", error);
      const reason = error.reason || (error.data ? (error.data.message || JSON.stringify(error.data)) : null) || error.message;
      setErrorMessage(`Transaction failed: ${reason}`);
      setTxStatus(TxStatus.Error);
      setTxMessage(''); // Clear tx message on error
      return false; // Indicate failure
    } finally {
       // Optional: reset TxStatus to Idle after a delay?
        setTimeout(() => {
           if (txStatus !== TxStatus.Error) { // Keep error shown until user dismisses?
              setTxStatus(TxStatus.Idle)
           }
        }, 3000) // Reset after 3s if not an error
    }
  };

   // Format Date for display
    const formatDateTime = (date) => {
        if (!date || !(date instanceof Date)) return "N/A";
        try {
           return date.toLocaleString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit', hour12: true
           });
       } catch (e) {
           return "Invalid Date";
       }
    }

   // Get Status Class Name for CSS
   const getStatusClass = (statusString) => {
     if (!statusString) return '';
     return `status-${statusString.toLowerCase()}`;
   }


  // ---- Wallet Connection ----
  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setErrorMessage("MetaMask (or another Ethereum wallet) is not installed.");
      return;
    }
    setGlobalLoading(true);
    clearMessages();
    try {
      const web3Provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      await web3Provider.send("eth_requestAccounts", []);
      const web3Signer = web3Provider.getSigner();
      const address = await web3Signer.getAddress();
      const networkInfo = await web3Provider.getNetwork();

      setProvider(web3Provider);
      setSigner(web3Signer);
      setAccount(address);
      setNetwork(networkInfo);
      setIsConnected(true);
      setSuccessMessage("Wallet connected successfully!");

      // Add listeners (moved outside setupContract for immediate attachment)
      window.ethereum.removeAllListeners('accountsChanged'); // Clear old listeners first
      window.ethereum.on('accountsChanged', (accounts) => handleAccountsChanged(accounts, web3Provider));

       window.ethereum.removeAllListeners('chainChanged');
      window.ethereum.on('chainChanged', (_chainId) => {
        console.log('Network changed, reloading...');
        window.location.reload();
      });

    } catch (error) {
      console.error("Wallet connection error:", error);
      const userRejected = error.code === 4001;
      setErrorMessage(userRejected ? "Connection rejected. Please connect your wallet." : `Failed to connect wallet: ${error.message || error}`);
      resetApp();
    } finally {
      setGlobalLoading(false);
    }
  }, []); // No dependency needed on setupContract

  const handleAccountsChanged = (accounts, currentProvider) => {
     console.log('Accounts changed:', accounts);
      if (accounts.length > 0) {
         setAccount(accounts[0]);
         // Re-get signer for the new account
         if(currentProvider) {
            const newSigner = currentProvider.getSigner();
             setSigner(newSigner);
             // Contract setup will re-run due to signer dependency change
         }
      } else {
         resetApp(); // Disconnected
         setErrorMessage("Wallet disconnected. Please connect again.");
     }
  };


  const resetApp = () => {
    setProvider(null);
    setSigner(null);
    setContract(null);
    setAccount(null);
    setNetwork(null);
    setIsConnected(false);
    setIsOwner(false);
    clearMessages();
    setElections([]);
    setSelectedElectionId('');
    setSelectedElectionDetails(null);
    setSelectedElectionProposals([]);
    // Reset other state? Maybe not elections list to avoid full refresh annoyance
  };


  // ---- Contract Interaction Setup ----
   const setupContract = useCallback(async () => {
     // Only proceed if provider, signer, and address are valid
     if (!provider || !signer || !VERITAS_VOTE_CONTRACT_ADDRESS || !ethers.utils.isAddress(VERITAS_VOTE_CONTRACT_ADDRESS)) {
         console.log("Dependencies not ready for contract setup.");
          // Don't set an error here unless the address is clearly invalid and present
         if (VERITAS_VOTE_CONTRACT_ADDRESS && !ethers.utils.isAddress(VERITAS_VOTE_CONTRACT_ADDRESS)){
              setErrorMessage("Invalid Contract Address configured in App.js");
         }
          setContract(null);
          setIsOwner(false);
         return;
      }

     console.log("Setting up contract...");
     clearMessages(); // Clear messages on re-setup
     setGlobalLoading(true);
      try {
           const voteContract = new ethers.Contract(
                VERITAS_VOTE_CONTRACT_ADDRESS,
                VeritasVoteABI.abi,
                signer // Use signer for transactions
            );

            // Perform a simple read call to verify contract connection
            const ownerAddress = await voteContract.owner(); // Throws if contract invalid/wrong network
            setContract(voteContract);
            console.log("Contract instance created:", voteContract.address);

            // Check if connected account is owner
            const currentAddress = await signer.getAddress();
            setIsOwner(currentAddress.toLowerCase() === ownerAddress.toLowerCase());
            console.log("Connected as Owner:", currentAddress.toLowerCase() === ownerAddress.toLowerCase());


            // Fetch initial list of elections only after successful contract setup
             await fetchElections(voteContract);

      } catch (error) {
           console.error("Failed to set up contract interaction:", error);
           setErrorMessage("Failed to connect to the VeritasVote smart contract. Check console, ensure you're on the correct network ("+ network?.name + ") and the contract address is correct.");
           setContract(null);
           setIsOwner(false);
      } finally {
          setGlobalLoading(false);
      }
  }, [provider, signer, network]); // Rerun when provider/signer/network changes, fetchElections removed to avoid loop


  // ---- Fetch Elections ----
   const fetchElections = useCallback(async (currentContract = contract) => {
    if (!currentContract) return;
    console.log("Fetching elections list...");
    setGlobalLoading(true); // Use global loading for list fetch
    clearMessages(); // Clear messages before fetch
    try {
      const totalElectionCount = await currentContract.getTotalElections();
      const count = totalElectionCount.toNumber();
      const promises = [];
      for (let i = 1; i <= count; i++) {
        promises.push(currentContract.getElectionDetails(i));
      }
      const results = await Promise.allSettled(promises);

      const fetchedElections = results
          .filter(result => result.status === 'fulfilled')
          .map(result => {
              const details = result.value;
              const statusMap = ['Pending', 'Active', 'Closed'];
              return {
                id: details.id.toNumber(),
                name: details.name,
                startTime: new Date(details.startTime.toNumber() * 1000),
                endTime: new Date(details.endTime.toNumber() * 1000),
                status: statusMap[details.status] || 'Unknown',
                totalVotesCast: details.totalVotesCast.toNumber()
              };
          })
          .reverse(); // Show newest first

       setElections(fetchedElections);
       if (fetchedElections.length === 0 && count > 0) {
            setErrorMessage("Could not load details for any elections, though some exist.");
       } else if (fetchedElections.length < count) {
            console.warn("Some elections could not be loaded.");
           // Maybe set a non-blocking warning message?
       }


    } catch (error) {
      console.error("Error fetching elections:", error);
      setErrorMessage("Could not fetch the list of elections.");
       setElections([]);
    } finally {
       setGlobalLoading(false);
    }
   }, [contract]); // Depend only on contract instance


  // ---- Fetch Specific Election Data (Proposals, Vote Status) ----
  const fetchSelectedElectionData = useCallback(async () => {
     if (!contract || !selectedElectionId || !account) return;

     const id = parseInt(selectedElectionId);
     if (isNaN(id) || id <= 0) {
         setErrorMessage("Invalid Election ID.");
         return;
     }

     console.log(`Fetching data for selected election ID: ${id}`);
     setGlobalLoading(true); // Use global loading while fetching details
     clearMessages();
     setHasVotedStatus(null); // Reset while fetching
     setVoterChoice(null);
     setSelectedElectionProposals([]); // Clear proposals while fetching
     setSelectedElectionDetails(null); // Clear old details

     try {
       // Find the basic details from the already fetched list first for responsiveness
        const preliminaryDetails = elections.find(e => e.id === id);
        if(preliminaryDetails) setSelectedElectionDetails(preliminaryDetails);

        // Fetch details, proposals, and vote status concurrently
         const [detailsResult, proposalsResult, votedResult] = await Promise.allSettled([
            contract.getElectionDetails(id),
            contract.getElectionProposals(id),
            contract.hasVoted(account, id)
        ]);

         // Update details with fresh data (might change status/vote count)
         if (detailsResult.status === 'fulfilled') {
             const details = detailsResult.value;
             const statusMap = ['Pending', 'Active', 'Closed'];
             const freshDetails = {
                id: details.id.toNumber(), name: details.name,
                startTime: new Date(details.startTime.toNumber() * 1000),
                endTime: new Date(details.endTime.toNumber() * 1000),
                status: statusMap[details.status] || 'Unknown',
                totalVotesCast: details.totalVotesCast.toNumber()
             };
            setSelectedElectionDetails(freshDetails);
             // If status changed from list, maybe refresh list in background? (optional)
             // if (preliminaryDetails && preliminaryDetails.status !== freshDetails.status) {
             //   fetchElections();
             // }
         } else { throw new Error(`Failed to fetch election details: ${detailsResult.reason?.message || detailsResult.reason}`); }

        // Update proposals
        if (proposalsResult.status === 'fulfilled') {
             const fetchedProposals = proposalsResult.value.map(p => ({
                 id: p.id.toNumber(), description: p.description,
                 voteCount: p.voteCount.toNumber()
             }));
             setSelectedElectionProposals(fetchedProposals);
         } else { throw new Error(`Failed to fetch proposals: ${proposalsResult.reason?.message || proposalsResult.reason}`); }

         // Update vote status
        if (votedResult.status === 'fulfilled') {
             setHasVotedStatus(votedResult.value);
              if (votedResult.value) {
                  // If voted, fetch their choice
                 try {
                    const choiceResult = await contract.getVoteChoice(account, id);
                    setVoterChoice(choiceResult.toNumber());
                  } catch (choiceError) {
                     console.warn("Could not fetch voter choice:", choiceError);
                     // Set voter choice to something indicating error?
                     setVoterChoice('Error');
                  }
              }
          } else {
              // Don't throw, maybe user isn't registered, etc. Log it.
             console.warn("Could not determine voting status:", votedResult.reason);
             // Keep hasVotedStatus null maybe? Or set to false? Depends on desired UX.
              setHasVotedStatus(null); // Indicates indeterminate state
         }

     } catch (error) {
        console.error("Error fetching selected election data:", error);
        setErrorMessage(error.message || "An unexpected error occurred loading election data.");
        // Reset relevant state on error
        setSelectedElectionDetails(null);
        setSelectedElectionProposals([]);
        setHasVotedStatus(null);
         setVoterChoice(null);
         setSelectedElectionId(''); // Deselect on error maybe?
     } finally {
         setGlobalLoading(false);
     }
   }, [contract, selectedElectionId, account, elections, fetchElections]); // Add fetchElections dependency if enabling list refresh


  // ---- Contract Write Function Handlers ----

   const handleRegisterVoterSubmit = async (event) => {
     event.preventDefault();
     if (!contract || !isOwner || !voterAddressToAdd || txStatus === TxStatus.Mining || txStatus === TxStatus.Sending) return;
     if (!ethers.utils.isAddress(voterAddressToAdd)) {
       setErrorMessage("Invalid Ethereum address provided.");
       return;
     }
     const success = await handleTx(
        contract.registerVoter(voterAddressToAdd),
        `Voter ${voterAddressToAdd.substring(0,6)}...`
     );
     if (success) {
        setVoterAddressToAdd(''); // Clear input on success
     }
   };

   const handleCreateElectionSubmit = async (event) => {
      event.preventDefault();
      if (!contract || !isOwner || txStatus === TxStatus.Mining || txStatus === TxStatus.Sending) return;

      const proposalArray = proposalsInput.split(',').map(p => p.trim()).filter(p => p);
      if (proposalArray.length < 2) { setErrorMessage("At least two proposals required (comma-separated)."); return; }
      if (!electionName.trim()) { setErrorMessage("Election name is required."); return; }
      if (!startTime || !endTime) { setErrorMessage("Start and End times are required."); return; }

      let startTimestamp, endTimestamp;
      try {
         startTimestamp = Math.floor(new Date(startTime).getTime() / 1000);
         endTimestamp = Math.floor(new Date(endTime).getTime() / 1000);
         if (isNaN(startTimestamp) || isNaN(endTimestamp)) throw new Error("Invalid date format selected.");
         if (endTimestamp <= startTimestamp) throw new Error("End time must be after start time.");
         const nowSeconds = Math.floor(Date.now() / 1000);
         // Allow a small buffer (e.g., 1 min) for clock skew/tx time
          if (startTimestamp < nowSeconds - 60) throw new Error("Start time cannot be in the past.");

     } catch (dateError) { setErrorMessage(`Date error: ${dateError.message}`); return; }

      const success = await handleTx(
         contract.createElection(electionName, startTimestamp, endTimestamp, proposalArray),
         `Election "${electionName}" created`
      );
      if (success) {
         // Clear form and refresh election list
         setElectionName(''); setProposalsInput(''); setStartTime(''); setEndTime('');
         await fetchElections();
         // Maybe automatically select the newly created election? (More complex state mgmt needed)
      }
   };


  const handleStartSelectedElection = async () => {
     if (!contract || !isOwner || !selectedElectionDetails || selectedElectionDetails.status !== 'Pending' || txStatus === TxStatus.Mining || txStatus === TxStatus.Sending) return;
      // Add client-side time check for better UX, though contract enforces it
      if (Date.now() < selectedElectionDetails.startTime.getTime()) {
         setErrorMessage("Cannot start election before its designated start time.");
         return;
      }

     const success = await handleTx(
         contract.startElection(selectedElectionDetails.id),
         `Election ${selectedElectionDetails.id} started`
     );
      if (success) {
         await fetchSelectedElectionData(); // Refresh current view
         await fetchElections(); // Refresh list view status
      }
   };

    const handleEndSelectedElection = async () => {
      if (!contract || !isOwner || !selectedElectionDetails || selectedElectionDetails.status !== 'Active' || txStatus === TxStatus.Mining || txStatus === TxStatus.Sending) return;
       // Add client-side time check
      if (Date.now() < selectedElectionDetails.endTime.getTime()) {
          // Maybe allow owner to end early? Contract check is the source of truth.
           console.warn("Attempting to end election before its designated end time (contract will enforce).");
      }

      const success = await handleTx(
          contract.endElection(selectedElectionDetails.id),
          `Election ${selectedElectionDetails.id} ended`
      );
      if (success) {
          await fetchSelectedElectionData(); // Refresh current view
          await fetchElections(); // Refresh list view status
      }
   };

   const handleCastVoteSubmit = async (event) => {
       event.preventDefault();
       if (!contract || !account || !selectedElectionDetails || selectedElectionDetails.status !== 'Active' || !selectedProposalIdToVote || hasVotedStatus || txStatus === TxStatus.Mining || txStatus === TxStatus.Sending) return;

      const electionIdNum = selectedElectionDetails.id;
      const proposalIdNum = parseInt(selectedProposalIdToVote);

       // Client-side check for selection
      if(isNaN(proposalIdNum) || proposalIdNum <= 0) {
         setErrorMessage("Please select a valid proposal to vote for.");
         return;
      }

       const success = await handleTx(
           contract.castVote(electionIdNum, proposalIdNum),
           `Vote cast for proposal ${proposalIdNum}`
       );
       if (success) {
           setSelectedProposalIdToVote(''); // Clear selection
            await fetchSelectedElectionData(); // Refresh vote status and counts
            // Optimistically update total votes in the details view? (Or wait for fetch)
       } else {
            // Handle specific voting errors shown to user
           if (errorMessage.includes("not a registered voter")) {
             setErrorMessage("Vote failed: Your connected account is not registered to vote.");
           } else if (errorMessage.includes("already cast a vote")) {
              setErrorMessage("Vote failed: You have already voted in this election.");
           } // Other errors shown generically by handleTx
       }
   };


  // ---- Effects ----

   // Effect to setup contract interaction when dependencies are ready
   useEffect(() => {
       setupContract();
   }, [setupContract]); // Relies on useCallback deps: [provider, signer, network]

   // Effect to fetch election details when selection changes
   useEffect(() => {
     if (selectedElectionId && contract && account) {
       fetchSelectedElectionData();
     } else {
       // Clear details if selection is removed or deps change
       setSelectedElectionDetails(null);
       setSelectedElectionProposals([]);
        setHasVotedStatus(null);
        setVoterChoice(null);
     }
   }, [selectedElectionId, contract, account, fetchSelectedElectionData]);

  // Effect to clear transient success/error messages
   useEffect(() => {
    let timer;
    if (successMessage) {
      timer = setTimeout(() => setSuccessMessage(''), 5000);
    }
    // We might want errors to persist until manually cleared or another action taken
    // if (errorMessage) {
    //   timer = setTimeout(() => setErrorMessage(''), 7000);
    // }
    return () => clearTimeout(timer);
   }, [successMessage /*, errorMessage */]);


  // ---- Render Logic ----

  const renderConnectionArea = () => (
    <div className="connect-wallet-area card">
       <h2>Connection Status</h2>
       {!isConnected ? (
         <>
           <p>Please connect your wallet (e.g., MetaMask) to use VeritasVote.</p>
           <button onClick={connectWallet} disabled={globalLoading} className="button button-primary">
             {globalLoading ? 'Connecting...' : 'Connect Wallet'}
           </button>
         </>
       ) : (
         <div className="connection-info">
           <p><span>Account:</span> {account?.substring(0, 6)}...{account?.substring(account.length - 4)}</p>
           <p><span>Network:</span> {network?.name} (ID: {network?.chainId})</p>
           {contract ? (
              <p className="contract-address"><span>Contract:</span> {contract.address.substring(0, 6)}...{contract.address.substring(contract.address.length - 4)} {isOwner && <strong className="owner-badge">(You are Owner)</strong>}</p>
           ) : (
              <p className='error-text'>Contract not loaded. Check address and network.</p>
           )}
            {/* Simple Disconnect - Reloads page */}
            <button onClick={() => window.location.reload()} className="button button-secondary button-small">
              Disconnect (Reload)
            </button>
         </div>
       )}
     </div>
  );

   const renderAdminPanel = () => (
       isOwner && isConnected && contract && (
           <section className="admin-section card">
                <h2 className='card-header'>Admin Controls</h2>

               {/* Voter Registration Form */}
                <form onSubmit={handleRegisterVoterSubmit} className="admin-form">
                   <h3>Register Voter</h3>
                    <div className="form-group">
                       <label htmlFor="voterAddress">Voter Address:</label>
                       <input
                         id="voterAddress"
                         type="text"
                         placeholder="0x..."
                         value={voterAddressToAdd}
                         onChange={(e) => setVoterAddressToAdd(e.target.value)}
                         required
                         disabled={txStatus === TxStatus.Mining || txStatus === TxStatus.Sending}
                       />
                   </div>
                   <button type="submit" disabled={!voterAddressToAdd || txStatus === TxStatus.Mining || txStatus === TxStatus.Sending} className="button button-primary">
                     Register Voter
                   </button>
                </form>
                <hr className="form-divider"/>
               {/* Election Creation Form */}
               <form onSubmit={handleCreateElectionSubmit} className="admin-form">
                  <h3>Create New Election</h3>
                   <div className="form-group">
                       <label htmlFor="electionName">Election Name:</label>
                       <input
                         id="electionName" type="text"
                         placeholder="e.g., Board Election 2024"
                         value={electionName}
                         onChange={(e) => setElectionName(e.target.value)}
                         required
                         disabled={txStatus === TxStatus.Mining || txStatus === TxStatus.Sending}
                        />
                   </div>
                   <div className="form-group">
                       <label htmlFor="proposals">Proposals (comma-separated):</label>
                       <textarea
                          id="proposals"
                          placeholder="Yes, No, Abstain"
                          value={proposalsInput}
                          onChange={(e) => setProposalsInput(e.target.value)}
                          required
                          rows={3}
                          disabled={txStatus === TxStatus.Mining || txStatus === TxStatus.Sending}
                       />
                   </div>
                   <div className="form-group form-group-inline">
                       <div>
                           <label htmlFor="startTime">Start Time:</label>
                           <input
                             id="startTime" type="datetime-local"
                             value={startTime}
                             onChange={(e) => setStartTime(e.target.value)}
                             required
                             disabled={txStatus === TxStatus.Mining || txStatus === TxStatus.Sending}
                            />
                       </div>
                        <div>
                           <label htmlFor="endTime">End Time:</label>
                           <input
                             id="endTime" type="datetime-local"
                             value={endTime}
                             onChange={(e) => setEndTime(e.target.value)}
                             required
                              disabled={txStatus === TxStatus.Mining || txStatus === TxStatus.Sending}
                           />
                       </div>
                   </div>
                   <button type="submit" disabled={!electionName || !proposalsInput || !startTime || !endTime || txStatus === TxStatus.Mining || txStatus === TxStatus.Sending} className="button button-primary">
                      Create Election
                   </button>
               </form>
           </section>
        )
   );

    const renderElectionList = () => (
     isConnected && contract && (
         <section className="election-list-section card">
            <h2 className='card-header'>Available Elections</h2>
              <button onClick={() => fetchElections()} disabled={globalLoading || (txStatus === TxStatus.Mining || txStatus === TxStatus.Sending)} className="button button-secondary button-small refresh-button">
                  <svg xmlns="http://www.w3.org/2000/svg" height="1em" viewBox="0 0 512 512" fill="currentColor"><path d="M463.5 224H472c13.3 0 24-10.7 24-24V72c0-9.7-5.8-18.5-14.8-22.2s-19.3-1.7-26.2 5.2L413.4 96.6c-87.6-86.5-228.7-86.2-315.8 1c-87.5 87.5-87.5 229.3 0 316.8s229.3 87.5 316.8 0c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0c-62.5 62.5-163.8 62.5-226.3 0s-62.5-163.8 0-226.3c62.2-62.2 162.7-62.5 225.3-1L327 183c-6.9 6.9-8.9 17-5.2 26.2s12.5 14.8 22.2 14.8H463.5z"/></svg>
                   Refresh List
               </button>
              {globalLoading && elections.length === 0 && <p>Loading elections...</p>}
             {!globalLoading && elections.length === 0 && <p>No elections found or created yet.</p>}
             {elections.length > 0 && (
               <ul className="election-list">
                 {elections.map(election => (
                    <li key={election.id} className={`election-item ${election.id.toString() === selectedElectionId ? 'selected' : ''}`}>
                        <div className="item-info">
                           <span className={`status-indicator ${getStatusClass(election.status)}`} title={election.status}></span>
                           <span className='election-name'>{election.name} (ID: {election.id})</span>
                            <span className={`status-badge ${getStatusClass(election.status)}`}>{election.status}</span>
                       </div>
                       <button onClick={() => setSelectedElectionId(election.id.toString())} disabled={globalLoading || (txStatus === TxStatus.Mining || txStatus === TxStatus.Sending)} className="button button-secondary button-small">
                          {selectedElectionId === election.id.toString() ? 'Selected' : 'View Details'}
                       </button>
                    </li>
                  ))}
               </ul>
             )}
         </section>
      )
    );


    const renderElectionDetails = () => (
     isConnected && contract && selectedElectionId && (
       <section className="election-details-section card">
         {!selectedElectionDetails && globalLoading && <h2 className='card-header'>Loading Election Details...</h2>}
         {selectedElectionDetails && (
             <>
                <h2 className='card-header'>Election: {selectedElectionDetails.name} (ID: {selectedElectionDetails.id})</h2>
                 <div className="details-grid">
                   <p><strong>Status:</strong> <span className={`status-badge ${getStatusClass(selectedElectionDetails.status)}`}>{selectedElectionDetails.status}</span></p>
                   <p><strong>Starts:</strong> {formatDateTime(selectedElectionDetails.startTime)}</p>
                   <p><strong>Ends:</strong> {formatDateTime(selectedElectionDetails.endTime)}</p>
                   <p><strong>Votes Cast:</strong> {selectedElectionDetails.totalVotesCast}</p>
                </div>

               {/* Admin Start/End Buttons */}
               {isOwner && (
                    <div className="admin-actions">
                       {selectedElectionDetails.status === 'Pending' && (
                         <button onClick={handleStartSelectedElection} disabled={Date.now() < selectedElectionDetails.startTime.getTime() || txStatus === TxStatus.Mining || txStatus === TxStatus.Sending} className="button button-success">
                            Start Election Now
                              {Date.now() < selectedElectionDetails.startTime.getTime() && ' (Not Time Yet)'}
                         </button>
                        )}
                       {selectedElectionDetails.status === 'Active' && (
                          <button onClick={handleEndSelectedElection} disabled={txStatus === TxStatus.Mining || txStatus === TxStatus.Sending} className="button button-danger">
                            End Election Now
                             {Date.now() < selectedElectionDetails.endTime.getTime() && ' (Ends '} { /* Simple relative time could be nice here */ }
                          </button>
                        )}
                   </div>
               )}

                <hr className="section-divider"/>

               {/* Voting Section (if Active) */}
               {selectedElectionDetails.status === 'Active' && (
                  <div className="voting-section">
                     <h3>Cast Your Vote</h3>
                       {globalLoading && <p>Loading proposals...</p>}
                      {!globalLoading && selectedElectionProposals.length === 0 && <p>No proposals found for this election.</p>}
                     {selectedElectionProposals.length > 0 && (
                          <form onSubmit={handleCastVoteSubmit}>
                             <div className="proposals-list">
                                {selectedElectionProposals.map(proposal => (
                                   <div key={proposal.id} className="proposal-item radio-group">
                                       <input
                                          type="radio"
                                          id={`proposal-${proposal.id}`}
                                          name="proposalVote"
                                          value={proposal.id}
                                          checked={selectedProposalIdToVote === proposal.id.toString()}
                                          onChange={(e) => setSelectedProposalIdToVote(e.target.value)}
                                          disabled={hasVotedStatus || txStatus === TxStatus.Mining || txStatus === TxStatus.Sending}
                                      />
                                       <label htmlFor={`proposal-${proposal.id}`}>{proposal.description}</label>
                                   </div>
                                ))}
                             </div>

                               {hasVotedStatus === true && (
                                 <p className="info-message vote-status-message">✔️ You have already voted (Choice: Proposal #{voterChoice ?? '?'}).</p>
                              )}
                               {hasVotedStatus === false && (
                                 <button type="submit" disabled={!selectedProposalIdToVote || txStatus === TxStatus.Mining || txStatus === TxStatus.Sending} className="button button-primary button-large">
                                     Cast Vote
                                  </button>
                               )}
                              {hasVotedStatus === null && !globalLoading && (
                                 <p className="info-message vote-status-message">Checking your voting eligibility...</p>
                              )}
                         </form>
                       )}
                 </div>
                )}


                 {/* Results Section (if Closed or Pending) */}
                {(selectedElectionDetails.status === 'Closed' || selectedElectionDetails.status === 'Pending') && (
                    <div className="results-section">
                        <h3>Proposals {selectedElectionDetails.status === 'Closed' ? '& Final Results' : ''}</h3>
                         {globalLoading && <p>Loading proposals...</p>}
                        {!globalLoading && selectedElectionProposals.length === 0 && <p>No proposals loaded.</p>}
                       {selectedElectionProposals.length > 0 && (
                            <ul className="proposals-list results">
                             {selectedElectionProposals.sort((a,b) => b.voteCount - a.voteCount).map(proposal => ( // Sort by votes
                                 <li key={proposal.id} className="proposal-item">
                                    <span>{proposal.description}:</span>
                                     <strong>{proposal.voteCount} votes</strong>
                                 </li>
                             ))}
                           </ul>
                        )}
                         {selectedElectionDetails.status === 'Closed' && hasVotedStatus === true && (
                              <p className="info-message vote-status-message">Your vote was for proposal #{voterChoice ?? '?'}.</p>
                          )}
                        {/* TODO: Add Winning Proposal Display */}

                   </div>
                )}


           </>
         )}
       </section>
     )
    );


  // Main Render
  return (
    <div className="App">
      <header className="App-header">
         <div className='logo-container'>
             {/* Optional: Add a Logo SVG or Image */}
             <h1>VeritasVote</h1>
         </div>
         {/* Transaction Status / Global Messages */}
          <div className='global-messages'>
              {globalLoading && <div className='loading-indicator'>Loading Data...</div>}
             {txStatus === TxStatus.Sending && <div className='tx-indicator sending'>{txMessage}</div>}
             {txStatus === TxStatus.Mining && <div className='tx-indicator mining'>{txMessage} <span className="spinner"></span></div>}
             {errorMessage && <div className="error-message global-error">{errorMessage} <button onClick={() => setErrorMessage('')}>X</button></div>}
              {successMessage && <div className="success-message global-success">{successMessage}</div>}
          </div>
       </header>

        <main className="App-main">
             {renderConnectionArea()}

              <div className="content-area">
                   {/* Conditional rendering based on connection and contract load */}
                   {!isConnected || !contract ? (
                       <div className="centered-message card">
                           <p>Please connect your wallet and ensure you are on the correct network ({network?.name || '...'}) to interact with VeritasVote.</p>
                       </div>
                   ) : (
                      <>
                        <div className="left-panel">
                            {renderAdminPanel()}
                            {renderElectionList()}
                        </div>
                        <div className="right-panel">
                            {renderElectionDetails()}
                           {!selectedElectionId && isConnected && contract && (
                               <div className='placeholder card'>
                                  <p>Select an election from the list to view its details and vote.</p>
                              </div>
                            )}
                        </div>
                      </>
                   )}
              </div>
        </main>

      <footer className="App-footer">
        <p>VeritasVote - Secure & Transparent Voting | Built by [Your Name]</p>
       </footer>
    </div>
  );
}

export default App;