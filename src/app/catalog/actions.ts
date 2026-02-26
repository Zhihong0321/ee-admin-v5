"use server";

import { db } from "@/lib/db";
import { products, packages } from "@/db/schema";
import { ilike, or, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getProducts(search?: string) {
    try {
        const filters = search
            ? or(
                ilike(products.name, `%${search}%`),
                ilike(products.description, `%${search}%`),
                ilike(products.label, `%${search}%`)
            )
            : undefined;

        const data = await db
            .select()
            .from(products)
            .where(filters)
            .orderBy(desc(products.id))
            .limit(2000);

        return data;
    } catch (error) {
        console.error("Database error in getProducts:", error);
        return [];
    }
}

export async function updateProduct(id: number, data: Partial<typeof products.$inferInsert>) {
    try {
        await db
            .update(products)
            .set({
                ...data,
                updated_at: new Date(),
            })
            .where(eq(products.id, id));

        revalidatePath("/catalog");
        return { success: true };
    } catch (error) {
        console.error("Database error in updateProduct:", error);
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
}

export async function createProduct(data: typeof products.$inferInsert) {
    try {
        await db.insert(products).values({
            ...data,
            created_at: new Date(),
            updated_at: new Date(),
        });

        revalidatePath("/catalog");
        return { success: true };
    } catch (error) {
        console.error("Database error in createProduct:", error);
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
}

export async function deleteProduct(id: number) {
    try {
        await db.delete(products).where(eq(products.id, id));
        revalidatePath("/catalog");
        return { success: true };
    } catch (error) {
        console.error("Database error in deleteProduct:", error);
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
}

export async function getPackages(search?: string) {
    try {
        const filters = search
            ? or(
                ilike(packages.package_name, `%${search}%`),
                ilike(packages.invoice_desc, `%${search}%`),
                ilike(packages.type, `%${search}%`)
            )
            : undefined;

        const data = await db
            .select()
            .from(packages)
            .where(filters)
            .orderBy(desc(packages.id))
            .limit(2000);

        return data;
    } catch (error) {
        console.error("Database error in getPackages:", error);
        return [];
    }
}

export async function updatePackage(id: number, data: Partial<typeof packages.$inferInsert>) {
    try {
        await db
            .update(packages)
            .set({
                ...data,
                updated_at: new Date(),
            })
            .where(eq(packages.id, id));

        revalidatePath("/catalog");
        return { success: true };
    } catch (error) {
        console.error("Database error in updatePackage:", error);
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
}

export async function createPackage(data: typeof packages.$inferInsert) {
    try {
        await db.insert(packages).values({
            ...data,
            created_at: new Date(),
            updated_at: new Date(),
        });

        revalidatePath("/catalog");
        return { success: true };
    } catch (error) {
        console.error("Database error in createPackage:", error);
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
}

export async function deletePackage(id: number) {
    try {
        await db.delete(packages).where(eq(packages.id, id));
        revalidatePath("/catalog");
        return { success: true };
    } catch (error) {
        console.error("Database error in deletePackage:", error);
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
}
