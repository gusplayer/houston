export interface RoutineIntent {
  detected: boolean;
  suggestedPrompt: string;
  suggestedCron: string;
  suggestedCronLabel: string;
  suggestedName: string;
}

const NOT_DETECTED: RoutineIntent = {
  detected: false,
  suggestedPrompt: "",
  suggestedCron: "",
  suggestedCronLabel: "",
  suggestedName: "",
};

const DAY_MAP: Record<string, number> = {
  sunday: 0, sun: 0, domingo: 0,
  monday: 1, mon: 1, lunes: 1, segunda: 1,
  tuesday: 2, tue: 2, martes: 2, terça: 2,
  wednesday: 3, wed: 3, miércoles: 3, quarta: 3,
  thursday: 4, thu: 4, jueves: 4, quinta: 4,
  friday: 5, fri: 5, viernes: 5, sexta: 5,
  saturday: 6, sat: 6, sábado: 6,
};

function toTitleCase(text: string): string {
  return text
    .split(/\s+/)
    .slice(0, 5)
    .join(" ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 40);
}

export function detectRoutineIntent(userMessage: string): RoutineIntent {
  const msg = userMessage.trim();
  const lower = msg.toLowerCase();

  // Hourly
  if (/every hour|hourly|cada hora/.test(lower)) {
    return {
      detected: true,
      suggestedPrompt: msg,
      suggestedCron: "0 * * * *",
      suggestedCronLabel: "Every hour",
      suggestedName: toTitleCase(msg),
    };
  }

  // Weekday patterns
  if (/every weekday|every work\s*day|each weekday|cada día hábil|días laborales/.test(lower)) {
    return {
      detected: true,
      suggestedPrompt: msg,
      suggestedCron: "0 9 * * 1-5",
      suggestedCronLabel: "Weekdays at 9:00 AM",
      suggestedName: toTitleCase(msg),
    };
  }

  // Specific day of week: "every monday", "every tuesday", etc.
  const dayMatch = lower.match(
    /every (monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|miércoles|jueves|viernes|sábado|domingo)/,
  );
  if (dayMatch) {
    const dayNum = DAY_MAP[dayMatch[1]] ?? 1;
    const dayLabel = dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1);
    return {
      detected: true,
      suggestedPrompt: msg,
      suggestedCron: `0 9 * * ${dayNum}`,
      suggestedCronLabel: `Every ${dayLabel} at 9:00 AM`,
      suggestedName: toTitleCase(msg),
    };
  }

  // Daily patterns
  if (
    /every day|daily|cada día|todos los días|diariamente|every morning|cada mañana|todos os dias|diariamente/.test(
      lower,
    )
  ) {
    return {
      detected: true,
      suggestedPrompt: msg,
      suggestedCron: "0 9 * * *",
      suggestedCronLabel: "Daily at 9:00 AM",
      suggestedName: toTitleCase(msg),
    };
  }

  // Weekly patterns (generic — no specific day)
  if (
    /every week|weekly|each week|once a week|semanalmente|cada semana|toda semana/.test(lower)
  ) {
    return {
      detected: true,
      suggestedPrompt: msg,
      suggestedCron: "0 9 * * 1",
      suggestedCronLabel: "Every Monday at 9:00 AM",
      suggestedName: toTitleCase(msg),
    };
  }

  // Monthly patterns
  if (
    /every month|monthly|once a month|mensualmente|cada mes|todo mês|mensalmente/.test(lower)
  ) {
    return {
      detected: true,
      suggestedPrompt: msg,
      suggestedCron: "0 9 1 * *",
      suggestedCronLabel: "Monthly on the 1st at 9:00 AM",
      suggestedName: toTitleCase(msg),
    };
  }

  return NOT_DETECTED;
}
