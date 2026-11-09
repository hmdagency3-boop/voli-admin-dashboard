export const pageHead = (title: string, description: string) => () => ({
  meta: [
    { title: `${title} — لوحة إدارة فولي` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} — لوحة إدارة فولي` },
    { property: "og:description", content: description },
  ],
});
