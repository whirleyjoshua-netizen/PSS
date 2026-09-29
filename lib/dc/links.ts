/** Direct Connect page links. Import-free, so a client component can use them. */
export const DC_NEW_QUOTE_URL = "https://dc.picbusiness.com/Orders/Orders/clientForm.pic?ORDa=a&a=a";
export const dcQuoteUrl = (quoteNo: string) =>
  `https://dc.picbusiness.com/Orders/Orders/Items/?Wo=${encodeURIComponent(quoteNo)}&ORDa=c&view=C`;
