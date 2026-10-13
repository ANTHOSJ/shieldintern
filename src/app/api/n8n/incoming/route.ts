import { NextRequest, NextResponse } from "next/server";
import { incomingStore } from "@/lib/incomingStore";

export async function POST(request: NextRequest) {
  try {
    // Optional webhook secret verification
    const expectedSecret = process.env.N8N_WEBHOOK_SECRET;
    if (expectedSecret) {
      const providedSecret = request.headers.get("x-n8n-secret");
      if (providedSecret !== expectedSecret) {
        return NextResponse.json(
          { error: "Unauthorized: Invalid webhook secret" },
          { status: 401 }
        );
      }
    }

    const body = await request.json();
    console.log("=== RAW N8N BODY ===", JSON.stringify(body, null, 2));
    
    // Robust sender extraction
    let sender = body.sender || body.From || body.from || body.senderEmail;
    if (typeof sender === "object" && sender !== null) {
      sender = sender.text || sender.value?.[0]?.address || sender.value?.[0]?.name || sender.address;
    }
    
    // Robust subject extraction
    let subject = body.subject || body.Subject || body.title;

    const emailBody = body.body || body.textPlain || body.snippet || body.text || "";
    const snippet = body.snippet || (emailBody ? emailBody.slice(0, 150) : "No preview available");

    // Fallback: If subject is missing, try extracting from the first line of body if it starts with "Subject:"
    if (!subject || subject === "No Subject") {
      const subjectMatch = emailBody.match(/Subject:\s*([^\r\n]+)/i);
      if (subjectMatch) {
        subject = subjectMatch[1].trim();
      } else {
        subject = "Internship / Job Offer";
      }
    }

    // Fallback: If sender is missing, try extracting email from body
    if (!sender || sender === "Unknown Recruiter") {
      const emailMatch = emailBody.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) {
        sender = emailMatch[1];
      } else {
        sender = "Recruiter (via Gmail)";
      }
    }

    const messageId = body.messageId || body.id || body.message_id;

    if (!emailBody && !snippet) {
      return NextResponse.json(
        { error: "Invalid payload: email content missing" },
        { status: 400 }
      );
    }

    const newOffer = await incomingStore.add({
      messageId: messageId ? String(messageId) : undefined,
      sender: String(sender),
      subject: String(subject),
      snippet: String(snippet),
      body: String(emailBody || snippet),
      receivedAt: body.receivedAt || new Date().toISOString(),
    });

    if (!newOffer) {
      return NextResponse.json({
        success: true,
        message: "Offer already processed or queued (deduplicated)",
        duplicate: true,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Offer queued for user review & permission",
      offerId: newOffer.id,
    });
  } catch (error) {
    console.error("n8n Webhook Error:", error);
    return NextResponse.json(
      { error: "Failed to process incoming offer" },
      { status: 500 }
    );
  }
}

// GET: Fetch all offers awaiting user permission
export async function GET() {
  const offers = await incomingStore.getAll();
  return NextResponse.json({ offers });
}

// DELETE: Remove an offer once analyzed or dismissed (or clear all with id=all)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing offer ID" }, { status: 400 });
    }

    if (id === "reset") {
      await incomingStore.reset();
      return NextResponse.json({ success: true, cleared: "reset" });
    }

    if (id === "all") {
      await incomingStore.clear();
      return NextResponse.json({ success: true, cleared: "all" });
    }

    const removed = await incomingStore.remove(id);
    return NextResponse.json({ success: removed });
  } catch (error) {
    console.error("Delete Offer Error:", error);
    return NextResponse.json({ error: "Failed to remove offer" }, { status: 500 });
  }
}
