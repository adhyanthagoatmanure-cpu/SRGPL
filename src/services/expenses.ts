import { db } from "../db/db";
import type { Expense, ID } from "../db/types";
import { AppError } from "../lib/errors";
import { baseFields, requireDateOrToday } from "../lib/ids";
import { money, optionalText } from "../lib/validation";
import { inRange, newestFirst, owned, rw } from "./common";
import type { DateRange } from "./sales";

export async function listExpenses(userId: ID, range: DateRange = {}): Promise<Expense[]> {
  return newestFirst(await db.expenses.where("userId").equals(userId).filter((e) => inRange(e.date, range.from, range.to)).toArray());
}

export interface ExpenseInput {
  itemId: ID;
  amount: string | number;
  remarks: string;
  date?: string;
}

export async function addExpense(userId: ID, input: ExpenseInput): Promise<Expense> {
  const amount = money(input.amount, "Amount", { allowZero: false });
  const remarks = optionalText(input.remarks, "Remarks");
  const date = requireDateOrToday(input.date);
  return rw([db.items, db.expenses], async () => {
    const item = await owned(db.items, userId, input.itemId, "Expense item");
    if (item.kind !== "expense") throw new AppError("Choose an expense item.");
    const e: Expense = { ...baseFields(userId), itemId: item.id, itemName: item.name, amount, remarks, date };
    await db.expenses.add(e);
    return e;
  });
}

export async function updateExpense(userId: ID, id: ID, input: Omit<ExpenseInput, "itemId">): Promise<void> {
  const amount = money(input.amount, "Amount", { allowZero: false });
  const remarks = optionalText(input.remarks, "Remarks");
  const date = requireDateOrToday(input.date);
  await rw([db.expenses], async () => {
    await owned(db.expenses, userId, id, "Expense");
    await db.expenses.update(id, { amount, remarks, date, updatedAt: Date.now() });
  });
}

export async function deleteExpense(userId: ID, id: ID): Promise<void> {
  await rw([db.expenses], async () => {
    await owned(db.expenses, userId, id, "Expense");
    await db.expenses.delete(id);
  });
}
