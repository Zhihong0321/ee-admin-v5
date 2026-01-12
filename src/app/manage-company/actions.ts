"use server";

import { db } from "@/lib/db";
import { invoice_templates } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getTemplates() {
  try {
    const data = await db
      .select()
      .from(invoice_templates)
      .orderBy(desc(invoice_templates.id));
    return data;
  } catch (error) {
    console.error("Database error in getTemplates:", error);
    throw error;
  }
}

export async function updateTemplate(id: number, data: Partial<typeof invoice_templates.$inferInsert>) {
  try {
    await db
      .update(invoice_templates)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(invoice_templates.id, id));
    
    revalidatePath("/manage-company");
    return { success: true };
  } catch (error) {
    console.error("Database error in updateTemplate:", error);
    throw error;
  }
}

export async function createTemplate(data: typeof invoice_templates.$inferInsert) {
  try {
    await db.insert(invoice_templates).values({
      ...data,
      created_at: new Date(),
      updated_at: new Date(),
    });
    
    revalidatePath("/manage-company");
    return { success: true };
  } catch (error) {
    console.error("Database error in createTemplate:", error);
    throw error;
  }
}

export async function setDefaultTemplate(id: number) {
  try {
    await db.transaction(async (tx) => {
      // Set all to false
      await tx.update(invoice_templates).set({ is_default: false });
      // Set specific one to true
      await tx.update(invoice_templates).set({ is_default: true }).where(eq(invoice_templates.id, id));
    });
    
    revalidatePath("/manage-company");
    return { success: true };
  } catch (error) {
    console.error("Database error in setDefaultTemplate:", error);
    throw error;
  }
}

export async function deleteTemplate(id: number) {
  try {
    await db.delete(invoice_templates).where(eq(invoice_templates.id, id));
    revalidatePath("/manage-company");
    return { success: true };
  } catch (error) {
    console.error("Database error in deleteTemplate:", error);
    throw error;
  }
}
