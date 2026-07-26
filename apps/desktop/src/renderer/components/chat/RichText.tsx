import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function RichText({ text }: { text: string }) {
  if (!text) return null
  return (
    <div className="rich-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) =>
            href && /^https?:\/\//i.test(href) ? (
              <a
                {...props}
                href={href}
                rel="noreferrer noopener"
                target="_blank"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          pre: ({ children }) => (
            <div className="code-block">
              <pre>{children}</pre>
            </div>
          ),
          img: ({ alt }) => <span className="markdown-image-label">{alt}</span>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
