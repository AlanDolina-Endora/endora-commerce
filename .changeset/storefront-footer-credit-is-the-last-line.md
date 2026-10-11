---
'@endora-commerce/cli': patch
---

The storefront that `endora new storefront` writes shows its "Built with ❤️ using Endora Commerce" credit as the last line of the footer.

The credit used to sit inside the copyright row, between the company details and the legal links.
It is now a row of its own under everything else the footer renders — the columns, the copyright
row and whatever a module adds through the `footer.bottom` and `footer.copyright` hooks — centred,
on one line while the width allows it, with the Endora Commerce mark beside the product name. The
link and its UTM parameters are unchanged.

**An existing storefront is not changed by upgrading.** `endora new storefront` copies the
reference once and the project owns it afterwards; to take this layout, apply the same edit to
`components/Footer.tsx` in the storefront project.
