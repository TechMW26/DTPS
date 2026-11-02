import {buildInvoiceDataFromPayment,generatePrintableInvoiceHTML,planPriceWithTax,invoiceDiscountPercent,formatInvoiceDate} from '@/lib/services/invoiceTemplate';

describe('invoice discount on plan price with GST',()=>{
 const base={_id:'aaaaaaaaaaaaaaaaaaaaaaaa',createdAt:'2026-11-02T06:00:00Z',paidAt:'2026-11-02T06:00:00Z',status:'paid',planName:'Weight Loss',invoiceNumber:'INV/26-27/1/00001'};
 it('shows the HC discount % and keeps the paid total',()=>{
  const d=buildInvoiceDataFromPayment({...base,finalAmount:2500,invoiceListAmount:planPriceWithTax(3000,0)});
  expect(d.discountPercent).toBe(16.67);
  expect(d.finalAmount).toBe(2500);
  expect(d.taxAmount).toBe(381.36);
  expect(Math.round((d.baseAmount-d.discountAmount)*100)/100).toBe(2118.64);
  const html=generatePrintableInvoiceHTML(d);
  expect(html).toContain('Discount (16.67%)');
  expect(html).toContain('INR 2,500.00');
  expect(html).toContain('Dtpoonamsagar');
  expect(html).toContain('icon-512x512.png');
 });
 it('takes the % on amount + GST',()=>{
  expect(planPriceWithTax(4237.29,18)).toBe(5000);
  expect(invoiceDiscountPercent(5000,4500)).toBe(10);
  expect(invoiceDiscountPercent(5000,3800)).toBe(24);
 });
 it('shows no discount line without a plan price',()=>{
  const d=buildInvoiceDataFromPayment({...base,finalAmount:2500});
  expect(d.discountAmount).toBe(0);
  expect(generatePrintableInvoiceHTML(d)).not.toContain('Discount (');
 });
 it('formats dates like the old invoices',()=>{
  expect(formatInvoiceDate('2026-01-20T10:00:00Z')).toBe('Jan. 20, 2026');
 });
});