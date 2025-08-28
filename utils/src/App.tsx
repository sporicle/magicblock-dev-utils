import DelegationChecker from './DelegationChecker'
import './App.css'

// Required CSS for wallet adapter UI
import '@solana/wallet-adapter-react-ui/styles.css';
// Custom wallet styles to fix visibility
import './WalletStyles.css';

function App() {
  return <DelegationChecker />
}

export default App
