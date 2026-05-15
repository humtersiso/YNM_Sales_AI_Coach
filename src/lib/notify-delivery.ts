export type NotifyRecipient = { email: string; name: string };

export type NotifyDeliveryResult = {
  mode: "mock" | "sendgrid";
  summaryMessage: string;
  details?: string[];
};

/**
 * POC：若設定 SENDGRID_API_KEY + NOTIFY_FROM_EMAIL 則經 SendGrid 寄出；
 * 否則僅回傳 mock 摘要（仍會寫入通知紀錄）。
 */
export async function deliverNotifyEmails(opts: {
  recipients: NotifyRecipient[];
  subject: string;
  text: string;
}): Promise<NotifyDeliveryResult> {
  const key = process.env.SENDGRID_API_KEY;
  const from = process.env.NOTIFY_FROM_EMAIL?.trim();

  if (!opts.recipients.length) {
    return { mode: "mock", summaryMessage: "Mock: 無收件人" };
  }

  if (!key || !from) {
    const lines = opts.recipients.map((r) => `${r.name}<${r.email}>`);
    return {
      mode: "mock",
      summaryMessage: `Mock: 已建立專家通知任務（未設定 SENDGRID_API_KEY 或 NOTIFY_FROM_EMAIL）；預計寄送：${lines.join("、")}`,
    };
  }

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: opts.recipients.map((r) => ({ email: r.email, name: r.name })),
        },
      ],
      from: { email: from },
      subject: opts.subject,
      content: [{ type: "text/plain", value: opts.text }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return {
      mode: "sendgrid",
      summaryMessage: `SendGrid 寄送失敗：${res.status} ${errText.slice(0, 500)}`,
      details: [errText],
    };
  }

  return {
    mode: "sendgrid",
    summaryMessage: "SendGrid: 通知信已送出",
    details: opts.recipients.map((r) => `${r.email}: ok`),
  };
}
