interface SafetyNumberProps {
  accountId: string;
  safetyNumber: string;
  onContinue?: () => void;
}

export function SafetyNumber({ accountId, safetyNumber, onContinue }: SafetyNumberProps) {
  return (
    <main>
      <h1>Your Safety Number</h1>
      <p data-testid="safety-number">{safetyNumber}</p>
      <p>Share this number with contacts to verify your identity.</p>
      <p>
        Your account ID: <span data-testid="account-id">{accountId}</span>
      </p>
      <p>Share this with a contact so they can start a conversation with you.</p>
      {onContinue && <button onClick={onContinue}>Continue</button>}
    </main>
  );
}
