export default function LoadingSurface({ label }: { label: string }) {
  return (
    <div className="loading-surface" role="status" aria-live="polite">
      {label}
    </div>
  );
}
