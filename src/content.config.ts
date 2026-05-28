import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  schema: () =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      slug: z.string().optional(),
      tags: z.array(z.string()).default([]),
      excerpt: z.string().optional(),
      hero_image: z.string().optional(),
      draft: z.boolean().default(false),
      original_url: z.string().url().optional(),
    }),
});

const pages = defineCollection({
  loader: glob({ base: "./src/content/pages", pattern: "**/*.{md,mdx}" }),
  schema: () =>
    z.object({
      title: z.string(),
      slug: z.string().optional(),
      hero_image: z.string().optional(),
      original_url: z.string().url().optional(),
      // Pages are always published; no draft field.
    }),
});

// Single-entry collection for site-level editable content (currently just the home page intro).
// Add more files here (e.g., footer.md) if you want them editable in the CMS too.
const site = defineCollection({
  loader: glob({ base: "./src/content/site", pattern: "**/*.{md,mdx}" }),
  schema: () =>
    z.object({
      heading: z.string(),
      recent_posts_count: z.number().int().min(0).max(50).default(5),
    }),
});

export const collections = { blog, pages, site };
