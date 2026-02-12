import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sedaRegistration } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateWithGemini } from "@/lib/ai-router";

interface RouteContext {
  params: Promise<{
    bubble_id: string;
  }>;
}

const VALID_BILL_FIELDS = ["tnb_bill_1", "tnb_bill_2", "tnb_bill_3"] as const;
type BillField = (typeof VALID_BILL_FIELDS)[number];

/**
 * POST /api/seda/[bubble_id]/extract-tnb-bill
 * Extract address and TNB account number from a TNB bill using Gemini AI.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { bubble_id } = await params;
    const body = await request.json();
    const billField = body.billField as BillField;

    if (!VALID_BILL_FIELDS.includes(billField)) {
      return NextResponse.json(
        { error: "Invalid billField. Must be tnb_bill_1, tnb_bill_2, or tnb_bill_3" },
        { status: 400 }
      );
    }

    // 1. Look up SEDA record
    const [seda] = await db
      .select()
      .from(sedaRegistration)
      .where(eq(sedaRegistration.bubble_id, bubble_id))
      .limit(1);

    if (!seda) {
      return NextResponse.json(
        { error: "SEDA registration not found" },
        { status: 404 }
      );
    }

    const billUrl = (seda as any)[billField] as string | null;
    if (!billUrl) {
      return NextResponse.json(
        { error: `No URL found in ${billField}` },
        { status: 400 }
      );
    }

    // 2. Fetch the bill image/PDF and convert to base64
    const response = await fetch(billUrl);
    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch bill file from URL" },
        { status: 502 }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString("base64");
    const mimeType = response.headers.get("content-type") || "image/jpeg";

    // 3. Send to Gemini with extraction prompt
    const prompt = `Extract from this TNB (Tenaga Nasional Berhad) electricity bill:
1. The full installation/premise address on the bill
2. The TNB account number (Nombor Akaun)

Respond ONLY with a JSON object like this:
{
  "address": "the full address here",
  "tnb_account_no": "the account number here"
}
If you cannot find the information, return null for that field.`;

    const aiResponse = await generateWithGemini(prompt, {
      model: "gemini-3-flash-preview",
      temperature: 0,
      file: {
        mimeType,
        data: base64Data,
      },
    });

    // 4. Parse JSON from AI response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    const extractedData = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      success: true,
      data: {
        address: extractedData.address || null,
        tnb_account_no: extractedData.tnb_account_no || null,
      },
    });
  } catch (error: any) {
    console.error("Extract TNB Bill Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to extract TNB bill data" },
      { status: 500 }
    );
  }
}
