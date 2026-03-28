export function entityId(value: any): string {
    return String(value?._id ?? value?.id ?? value);
}

export function expectISTISOString(value: string): void {
    expect(typeof value).toBe('string');
    expect(value).toMatch(/\+05:30$/);
}