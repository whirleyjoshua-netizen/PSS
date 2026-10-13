import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { JsonLd } from "@/components/seo/JsonLd";

const schema = { "@type": "Review", reviewBody: 'Great work.</script><script>alert("x")</script>' };

describe("JsonLd", () => {
  it("cannot be broken out of by a </script> inside the data", () => {
    const html = renderToStaticMarkup(<JsonLd schema={schema} />);
    expect(html.match(/<\/script>/gi)).toHaveLength(1);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("\\u003c/script>");
  });

  it("still parses back to the same data", () => {
    const { container } = render(<JsonLd schema={schema} />);
    const script = container.querySelector('script[type="application/ld+json"]')!;
    expect(JSON.parse(script.textContent ?? "")).toEqual(schema);
  });
});
