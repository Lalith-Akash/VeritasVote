# VeritasVote - A Decentralized Voting System

![VeritasVote Banner Placeholder](placeholder-banner.png) 

**VeritasVote** is a secure, transparent, and robust decentralized application (DApp) built on the Ethereum blockchain that allows communities or organizations to conduct fair and verifiable elections.

It leverages smart contracts for managing voter registration, election creation, vote casting, and result tallying, ensuring immutability and preventing censorship or manipulation.

## Features

*   **Secure Voter Registration:** Only the designated contract owner (Admin) can register eligible voter addresses. Batch registration is supported.
*   **Transparent Election Creation:** Admin creates elections with a clear name, start/end times, and distinct proposals.
*   **Controlled Election Lifecycle:** Elections transition through Pending, Active, and Closed states, managed by the Admin or automatically enforced by time constraints within the contract.
*   **On-Chain Voting:** Registered voters securely cast their vote for one proposal per election during the active voting period. Double-voting is prevented.
*   **Verifiable Results:** Vote counts for each proposal are publicly accessible and tallied directly by the smart contract. Winning proposal(s) are determined automatically after an election closes.
*   **Role-Based Access Control:** Clear separation between the Admin (owner) managing the system and the registered Voters participating in elections.
*   **Event Emission:** Important actions like voter registration, election creation, and vote casting emit events for easier off-chain tracking and UI updates.
*   **Security Focused:** Built using OpenZeppelin standard contracts (Ownable, ReentrancyGuard) and best practices.

## Technology Stack

*   **Smart Contract:**
    *   Solidity (`^0.8.18`)
    *   OpenZeppelin Contracts (`^4.8.3`)
*   **Development Environment:**
    *   Hardhat (`^2.14.0`): Compile, deploy, test, and debug Ethereum software.
    *   Ethers.js (`^5.7.2`): Interact with the Ethereum Blockchain and its ecosystem.
*   **Frontend:**
    *   React (`^18.2.0`): JavaScript library for building user interfaces.
    *   ethers.js (Frontend interaction)
    *   CSS (Basic styling - can be enhanced with frameworks like Tailwind, Material UI, etc.)
*   **Testing:**
    *   Hardhat Network (Local blockchain for development)
    *   Chai (Assertion library)
    *   Mocha (Test runner framework - included in Hardhat Toolbox)
*   **Deployment:**
    *   Target Blockchain: Ethereum Virtual Machine (EVM) compatible chains (e.g., Ethereum Mainnet, Sepolia Testnet, Polygon, etc.)
    *   Tools: Hardhat Deploy scripts.

## Project Structure

```
veritas-vote/
├── artifacts/      # Compiled contract ABIs and bytecode (generated)
├── cache/          # Hardhat cache (generated)
├── contracts/      # Solidity smart contracts
│   └── VeritasVote.sol
├── scripts/        # Deployment scripts
│   └── deploy.js
├── test/           # Contract unit tests
│   └── VeritasVote.test.js
├── client/         # React Frontend application (or 'src/' if not separate folder)
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.js          # Main application component
│   │   ├── App.css         # Basic styles
│   │   └── index.js        # Entry point
│   ├── package.json        # Frontend dependencies
│   └── ...               # Other components/assets
├── hardhat.config.js # Hardhat configuration
├── package.json      # Project dependencies and scripts (root)
├── .env.example      # Environment variable template
├── .gitignore        # Git ignore file
└── README.md         # This file
```

## Getting Started

### Prerequisites

*   Node.js (v16 or later recommended)
*   npm or yarn
*   MetaMask browser extension (or another Ethereum wallet)
*   Git

### Installation & Setup

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/YOUR_USERNAME/VeritasVote.git # <-- Replace with your repo URL
    cd VeritasVote
    ```

2.  **Install Root Dependencies (Hardhat & Contract related):**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Install Frontend Dependencies:**
    ```bash
    cd client
    npm install
    # or
    yarn install
    cd ..
    ```

4.  **Set Up Environment Variables:**
    *   Copy `.env.example` to a new file named `.env` in the project root:
        ```bash
        cp .env.example .env
        ```
    *   Edit the `.env` file and fill in your details:
        *   `SEPOLIA_RPC_URL`: Your RPC endpoint URL for the target testnet (e.g., from Alchemy or Infura).
        *   `PRIVATE_KEY`: The private key of the account you'll use for deployment (ensure this is a **development-only** key, not holding significant value!).
        *   `ETHERSCAN_API_KEY`: Your Etherscan API key (optional, for contract verification).

### Running Locally (Development)

1.  **Start a Local Hardhat Node:**
    Open a terminal in the project root and run:
    ```bash
    npx hardhat node
    ```
    This starts a local blockchain instance and provides several accounts with test Ether. Keep this terminal running.

2.  **Deploy the Contract to the Local Node:**
    Open a *second* terminal in the project root and run:
    ```bash
    npx hardhat run scripts/deploy.js --network localhost
    ```
    *   Copy the deployed contract address output by the script.

3.  **Update Frontend Contract Address:**
    *   Open `client/src/App.js` (or your main frontend file).
    *   Find the `VERITAS_VOTE_CONTRACT_ADDRESS` constant near the top.
    *   Paste the contract address you copied from the deployment script.

4.  **Start the Frontend Application:**
    In the second terminal (or a third one), navigate to the `client` directory and start the React app:
    ```bash
    cd client
    npm start
    # or
    yarn start
    ```
    Your browser should open automatically to `http://localhost:3000`.

5.  **Connect MetaMask to Localhost:**
    *   Open MetaMask.
    *   Click the network dropdown (usually says "Ethereum Mainnet").
    *   Select "Add Network" or "Localhost 8545" if already configured. If adding manually:
        *   Network Name: `Hardhat Localhost` (or anything you like)
        *   New RPC URL: `http://127.0.0.1:8545`
        *   Chain ID: `31337`
        *   Currency Symbol: `ETH` (or `GO`)
    *   Import one of the accounts provided by the `npx hardhat node` command using its private key (they are listed when the node starts). This account will be the contract Owner/Admin.

### Running Contract Tests

To run the Solidity unit tests:

```bash
npx hardhat test
```

To check test coverage:

```bash
npx hardhat coverage
```

### Deployment to a Testnet (e.g., Sepolia)

1.  **Ensure `.env` is configured** with your `SEPOLIA_RPC_URL`, `PRIVATE_KEY` (funded with Sepolia ETH from a faucet), and optional `ETHERSCAN_API_KEY`.
2.  **Run the deployment script:**
    ```bash
    npx hardhat run scripts/deploy.js --network sepolia
    ```
3.  **Copy the deployed contract address.**
4.  **Update `client/src/App.js`** with the new Sepolia contract address.
5.  **Build the frontend for production:**
    ```bash
    cd client
    npm run build
    # or
    yarn build
    ```
6.  **Deploy the `client/build` folder** to a static hosting provider like Netlify, Vercel, Fleek, or GitHub Pages.
7.  **Access your live DApp!** Users will need MetaMask connected to the Sepolia network.

## Usage Guide

1.  **Connect Wallet:** Click the "Connect Wallet" button and approve the connection in MetaMask.
2.  **Admin Functions (Owner Only):**
    *   **Register Voters:** Enter a valid Ethereum address and click "Register Voter".
    *   **Create Election:** Fill in the election name, proposals (comma-separated), and select start/end times. Click "Create Election".
    *   **Manage Elections:** View an election's details. If you are the owner and the election is Pending/Active, buttons to "Start Election" or "End Election" will appear at the appropriate times.
3.  **Voter Functions:**
    *   **View Elections:** See the list of available elections and their status.
    *   **View Details:** Click "View Details" for an election.
    *   **Vote:** If an election is "Active" and you are a registered voter who hasn't voted yet, select a proposal and click "Cast Vote". Approve the transaction in MetaMask.
    *   **View Results:** Once an election is "Closed", view the final vote counts for each proposal in the details section.

## Contributing

Contributions, issues, and feature requests are welcome! Please create an issue or pull request in the GitHub repository. [Link to your GitHub Issues/PRs]

## License

The code in this repository is licensed under the MIT License. This means that you are free to use, modify, and distribute the code, as long as you include the original copyright and license notice.
See `LICENSE` file for more information.

---

*This project was created by Lalith-Akash for portfolio purposes, demonstrating skills in blockchain development, smart contracts, and DApp creation.* 