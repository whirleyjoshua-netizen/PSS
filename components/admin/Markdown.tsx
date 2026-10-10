import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Agent reports. Raw HTML is never rendered (react-markdown's default, kept on purpose: reports are agent-written).
 * Images are never rendered either: a report quoting fetched web content could load a tracking pixel. */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="agent-report flex flex-col gap-3 text-sm leading-relaxed [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-rule [&_td]:p-2 [&_th]:border [&_th]:border-rule [&_th]:bg-ivory [&_th]:p-2 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:rounded [&_code]:bg-ivory [&_code]:px-1 [&_a]:underline">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
          table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div>,
          img: () => null,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
