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

  it("sends the closing Invite Us Over to the booking form on this page", async () => {
    await renderCategory(slug);
    expectClosingButtonToBook();
  });

  it("shows the consultation photo in the booking block", async () => {
    const { container } = await renderCategory(slug);
    expect(imageSrcs(container).some((src) => src.includes(consultationPhoto.src))).toBe(true);
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

    it("sends the closing Invite Us Over to the booking form on this page", async () => {
      await renderProduct(product.category, product.slug);
      expectClosingButtonToBook();
    });

    it("shows its own photo, or the consultation photo when it has none", async () => {
      const { container } = await renderProduct(product.category, product.slug);
      const expected = product.image?.src ?? consultationPhoto.src;
      expect(imageSrcs(container).some((src) => src.includes(expected))).toBe(true);
    });
  },
);
