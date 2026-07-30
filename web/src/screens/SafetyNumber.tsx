interface SafetyNumberProps {
  accountId: string;
  safetyNumber: string;
  onContinue?: () => void;
}

export function SafetyNumber({ accountId, safetyNumber, onContinue }: SafetyNumberProps) {
  return (
    <section className="panel stack">
      <h2>Your Identity</h2>
      <div>
        <p className="hint">Safety number - share out of band to verify you're really you.</p>
        <p className="chip chip--block" data-testid="safety-number">
          {safetyNumber}
        </p>
      </div>
      <div>
        <p className="hint">Account ID - share this so contacts can message you.</p>
        <p className="chip chip--block" data-testid="account-id">
          {accountId}
        </p>
      </div>
      {onContinue && <button onClick={onContinue}>Continue</button>}
    </section>
  );
}
