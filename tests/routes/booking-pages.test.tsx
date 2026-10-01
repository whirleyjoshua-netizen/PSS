import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import CategoryPage from "@/app/(site)/[category]/page";
import ProductPage from "@/app/(site)/[category]/[product]/page";
import { categories, products } from "@/content/products";
import { consultationPhoto } from "@/content/gallery";

const imageSrcs = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("img")).map((img) => decodeURIComponent(img.getAttribute("src") ?? ""));

async function renderCategory(slug: string) {
  return render(await CategoryPage({ params: Promise.resolve({ category: slug }) }));
}
async function renderProduct(category: string, product: string) {
  return render(await ProductPage({ params: Promise.resolve({ category, product }) }));
}

const treatmentsSent = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLInputElement>('form input[name="treatments"]')).map((i) => i.value);

/** The closing "Invite Us Over" sends the visitor up to the short form on this page, not to /contact. */
function expectClosingButtonToBook() {
  const links = screen.getAllByRole("link", { name: /invite us over/i });
  expect(links).toHaveLength(1);
  expect(links[0]).toHaveAttribute("href", "#book");
}

/** On a phone the form must come before the essay, or the ad visitor never sees it. */
function expectFormBeforeCopy(container: HTMLElement, firstParagraph: string) {
  const form = container.querySelector("form");
  const copy = Array.from(container.querySelectorAll("p")).find((p) => p.textContent === firstParagraph);
  expect(form).not.toBeNull();
  expect(copy).toBeDefined();
  expect(form!.compareDocumentPosition(copy!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe.each(categories.map((category) => [category.slug, category] as const))("/%s", (slug, category) => {
  it("has the booking form above the intro, once, with one h1", async () => {
    const { container } = await renderCategory(slug);
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expectFormBeforeCopy(container, category.intro[0]);
  });

  it("files the lead under this category, the name the contact form's checkbox sends", async () => {
    const { container } = await renderCategory(slug);
    expect(treatmentsSent(container)).toEqual([category.name]);
  });

  it("sends the closing Invite Us Over to the booking form on this page", async () => {
    await renderCategory(slug);
    expectClosingButtonToBook();
  });

  it("shows its hero video's still, else its own booking photo, else the consultation photo", async () => {
    const { container } = await renderCategory(slug);
    const inBlock = Array.from(container.querySelectorAll("section#book img")).map((img) =>
      decodeURIComponent(img.getAttribute("src") ?? ""),
    );
    expect(inBlock).toHaveLength(1);
    expect(inBlock[0]).toContain((category.heroVideo?.poster ?? category.bookingPhoto ?? consultationPhoto).src);
  });

  it("never shows the same photo twice on the page", async () => {
    const { container } = await renderCategory(slug);
    const srcs = imageSrcs(container);
    expect(new Set(srcs).size).toBe(srcs.length);
  });
});

describe.each(products.map((product) => [`${product.category}/${product.slug}`, product] as const))(
  "/%s",
  (_path, product) => {
    it("has the booking form above the body, once, with one h1", async () => {
      const { container } = await renderProduct(product.category, product.slug);
      expect(container.querySelectorAll("form")).toHaveLength(1);
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      expectFormBeforeCopy(container, product.body[0]);
    });

    it("files the lead under its parent category, the name the contact form's checkbox sends", async () => {
      const { container } = await renderProduct(product.category, product.slug);
      const parent = categories.find((category) => category.slug === product.category)!;
      expect(treatmentsSent(container)).toEqual([parent.name]);
    });

    it("sends the closing Invite Us Over to the booking form on this page", async () => {
      await renderProduct(product.category, product.slug);
      expectClosingButtonToBook();
    });

    it("shows its own photo, or the consultation photo when it has none", async () => {
      const { container } = await renderProduct(product.category, product.slug);
      const expected = product.image?.src ?? consultationPhoto.src;
      expect(imageSrcs(container).some((src) => src.includes(expected))).toBe(true);
    });

    it("never shows the same photo twice on the page", async () => {
      const { container } = await renderProduct(product.category, product.slug);
      const srcs = imageSrcs(container);
      expect(new Set(srcs).size).toBe(srcs.length);
    });

    it("tells its story under Why {name}, with what it is best for", async () => {
      await renderProduct(product.category, product.slug);
      expect(screen.getByRole("heading", { level: 2, name: `Why ${product.name}` })).toBeInTheDocument();
      expect(screen.getByText(product.bestFor)).toBeInTheDocument();
    });
  },
);
