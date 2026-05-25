export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-12 border-t border-[var(--line)] px-4 pb-8 pt-6 text-[var(--sea-ink-soft)]">
      <div className="inspector-wrap flex flex-col items-center justify-between gap-2 text-center text-sm sm:flex-row sm:text-left">
        <p className="m-0">&copy; {year} Agent Development Lab</p>
        <p className="m-0">Inspection UI · mock data · TanStack Start</p>
      </div>
    </footer>
  );
}
