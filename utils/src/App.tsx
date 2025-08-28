import DelegationChecker from './DelegationChecker'
import './App.css'

// Required CSS for wallet adapter UI
import '@solana/wallet-adapter-react-ui/styles.css';
// Custom wallet styles to fix visibility
import './WalletStyles.css';

function App() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#f8fafc',
      padding: '20px 0'
    }}>
      <DelegationChecker />
    </div>
  )
}

export default App
