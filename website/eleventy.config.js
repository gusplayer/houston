import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

export default function (eleventyConfig) {
  // Render a markdown string to HTML. Used by the changelog page to render
  // GitHub release bodies fetched at build time.
  eleventyConfig.addFilter("markdown", (str) => {
    if (!str) return "";
    return marked.parse(str);
  });

  // Inline a brand SVG from src/integration-icons/<slug>.svg, stripping
  // intrinsic fill/width/height and injecting fill="currentColor" so the
  // consumer can size with CSS and tint via the wrapper's `color`.
  eleventyConfig.addFilter("readSvg", (slug) => {
    if (!slug) return "";
    const filePath = path.resolve("src/integration-icons", `${slug}.svg`);
    try {
      let svg = fs.readFileSync(filePath, "utf-8");
      svg = svg.replace(/\s+fill="[^"]*"/g, "");
      svg = svg.replace(/\s+width="[^"]*"/g, "");
      svg = svg.replace(/\s+height="[^"]*"/g, "");
      svg = svg.replace(/<svg\b/, '<svg fill="currentColor" width="100%" height="100%"');
      return svg;
    } catch {
      // Missing SVG — caller renders the text-pill fallback.
      return "";
    }
  });

  // Pass through static assets unchanged
  eleventyConfig.addPassthroughCopy("src/favicon.svg");
  eleventyConfig.addPassthroughCopy("src/houston-black.svg");
  eleventyConfig.addPassthroughCopy("src/houston-gray.svg");
  eleventyConfig.addPassthroughCopy("src/og-image.jpg");
  eleventyConfig.addPassthroughCopy("src/icons");
  eleventyConfig.addPassthroughCopy("src/integration-icons");
  eleventyConfig.addPassthroughCopy("src/learn/style.css");
  eleventyConfig.addPassthroughCopy("src/slack");
  eleventyConfig.addPassthroughCopy("src/auth");
  eleventyConfig.addPassthroughCopy("src/_headers");

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
    },
    // Use Nunjucks for HTML files
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
}
