import { Link } from "react-router-dom";

/** A small "i" that explains a word or number on hover or keyboard focus. `to` links to the matching part of the Guide. */
export function InfoTip({ text, to }: { text: string; to?: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" aria-label="What is this?" className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 text-[10px] font-semibold normal-case text-zinc-500 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-300">i</button>
      <span role="tooltip" className="invisible absolute left-1/2 top-full z-50 w-60 -translate-x-1/2 pt-1 group-hover:visible group-focus-within:visible">
        <span className="block rounded-lg bg-zinc-900 px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-white shadow-lg whitespace-normal">
          {text}{to && <Link to={to} className="mt-1 block font-medium text-blue-300 hover:underline">More in the Guide →</Link>}
        </span>
      </span>
    </span>
  );
}
