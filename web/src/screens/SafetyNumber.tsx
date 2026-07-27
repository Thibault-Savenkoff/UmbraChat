interface SafetyNumberProps {
  safetyNumber: string;
  onContinue?: () => void;
}

export function SafetyNumber({ safetyNumber, onContinue }: SafetyNumberProps) {
  return (
    <main>
      <h1>Your Safety Number</h1>
      <p data-testid="safety-number">{safetyNumber}</p>
      <p>Share this number with contacts to verify your identity.</p>
      {onContinue && <button onClick={onContinue}>Continue</button>}
    </main>
  );
}
