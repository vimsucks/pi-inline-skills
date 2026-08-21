import type { AgentMessage } from "@earendil-works/pi-agent-core";

export const CUSTOM_MESSAGE_TYPE = "pi-inline-skills";

interface CustomMessageLike {
  role: "custom";
  customType: string;
}

export function moveInvocationBeforeUser(messages: AgentMessage[]): AgentMessage[] {
  const reordered: AgentMessage[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const current = messages[index];
    const next = messages[index + 1];

    if (current.role === "user" && isInvocationMessage(next)) {
      reordered.push(next, current);
      index += 1;
      continue;
    }

    reordered.push(current);
  }

  return reordered;
}

function isInvocationMessage(message: AgentMessage | undefined): message is AgentMessage & CustomMessageLike {
  return message?.role === "custom" && message.customType === CUSTOM_MESSAGE_TYPE;
}
