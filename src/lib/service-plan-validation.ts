import { z } from 'zod';

// HTML and older catalog forms can submit numeric strings. Retain strict bounds.
const numberField = (schema: z.ZodNumber) => z.preprocess(value =>
  typeof value === 'string' && value.trim() ? Number(value) : value, schema);
const tier = z.object({
  _id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  durationDays: numberField(z.number().int().min(1).max(36500)),
  durationLabel: z.string().trim().min(1).max(100),
  amount: numberField(z.number().finite().nonnegative()),
  maxDiscount: numberField(z.number().min(0).max(100)).default(0),
  extendDays: numberField(z.number().int().nonnegative()).default(0),
  freezeDays: numberField(z.number().int().nonnegative()).default(0),
  isActive: z.boolean().default(true),
});
export const servicePlanSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10000).optional(),
  features: z.array(z.string().trim().max(2000)).max(100).default([]),
  isActive: z.boolean().default(true),
  category: z.enum(['weight-loss','weight-gain','muscle-gain','diabetes','pcos','thyroid','general-wellness','custom','detox','sports-nutrition']),
  pricingTiers: z.array(tier).min(1).max(100),
  showToClients: z.boolean().default(true),
  maxDiscountPercent: numberField(z.number().min(0).max(100)).default(0),
});

export function servicePlanValidationMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  const field = String(issue.path.at(-1));
  const tierNumber = typeof issue.path[1] === 'number' ? issue.path[1] + 1 : null;
  const prefix = tierNumber ? `Pricing tier ${tierNumber}: ` : '';
  const messages: Record<string,string> = {
    name: 'Enter a plan name between 1 and 200 characters.',
    category: 'Choose a supported plan category.',
    pricingTiers: 'Add between 1 and 100 pricing tiers.',
    description: 'Shorten the description to 10,000 characters or fewer.',
    durationDays: 'Duration must be a whole number between 1 and 36,500 days.',
    durationLabel: 'Choose a duration for this tier.',
    amount: 'Amount must be a number of zero or greater.',
    maxDiscount: 'Discount must be between 0% and 100%.',
    maxDiscountPercent: 'Discount must be between 0% and 100%.',
    extendDays: 'Extend days must be a whole number of zero or greater.',
    freezeDays: 'Freeze days must be a whole number of zero or greater.',
    _id: 'Remove and re-add this pricing tier before saving.',
  };
  return prefix + (messages[field] || `Check ${field}: ${issue.message}`);
}
