import { db } from '@/lib/db';
import { schema_descriptions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/schema-manager/save-description
 * Saves or updates a column description
 * Body: { tableName: string, columnName: string, description: string, updatedBy?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tableName, columnName, description, updatedBy } = body;

    if (!tableName || !columnName || description === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'tableName, columnName, and description are required'
        },
        { status: 400 }
      );
    }

    // Check if description already exists
    const existing = await db
      .select()
      .from(schema_descriptions)
      .where(
        and(
          eq(schema_descriptions.table_name, tableName),
          eq(schema_descriptions.column_name, columnName)
        )
      );

    if (existing.length > 0) {
      // Update existing description
      await db
        .update(schema_descriptions)
        .set({
          description,
          updated_at: new Date(),
          updated_by: updatedBy
        })
        .where(
          and(
            eq(schema_descriptions.table_name, tableName),
            eq(schema_descriptions.column_name, columnName)
          )
        );

      return NextResponse.json({
        success: true,
        message: 'Description updated successfully'
      });
    } else {
      // Insert new description
      await db.insert(schema_descriptions).values({
        table_name: tableName,
        column_name: columnName,
        description,
        updated_by: updatedBy
      });

      return NextResponse.json({
        success: true,
        message: 'Description saved successfully'
      });
    }
  } catch (error) {
    console.error('Failed to save description:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/schema-manager/save-description
 * Batch save multiple descriptions
 * Body: { descriptions: Array<{tableName, columnName, description}>, updatedBy?: string }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { descriptions, updatedBy } = body;

    if (!Array.isArray(descriptions) || descriptions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'descriptions array is required'
        },
        { status: 400 }
      );
    }

    const results = await Promise.allSettled(
      descriptions.map(async ({ tableName, columnName, description }) => {
        // Check if description already exists
        const existing = await db
          .select()
          .from(schema_descriptions)
          .where(
            and(
              eq(schema_descriptions.table_name, tableName),
              eq(schema_descriptions.column_name, columnName)
            )
          );

        if (existing.length > 0) {
          // Update existing description
          await db
            .update(schema_descriptions)
            .set({
              description,
              updated_at: new Date(),
              updated_by: updatedBy
            })
            .where(
              and(
                eq(schema_descriptions.table_name, tableName),
                eq(schema_descriptions.column_name, columnName)
              )
            );
        } else {
          // Insert new description
          await db.insert(schema_descriptions).values({
            table_name: tableName,
            column_name: columnName,
            description,
            updated_by: updatedBy
          });
        }
      })
    );

    const failed = results.filter((r) => r.status === 'rejected');

    return NextResponse.json({
      success: true,
      message: `Saved ${results.length - failed.length} descriptions`,
      failed: failed.length,
      errors: failed.map((f) => String((f as any).reason))
    });
  } catch (error) {
    console.error('Failed to batch save descriptions:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(error)
      },
      { status: 500 }
    );
  }
}
