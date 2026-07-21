import type {
  DingTalkDirectoryPage,
  DingTalkGateway,
  DingTalkIdentity,
  DirectReminderInput,
  ReminderDelivery,
} from "./gateway";

export class MockDingTalkGateway implements DingTalkGateway {
  readonly sentReminders: DirectReminderInput[] = [];

  async exchangeAuthCode(authCode: string): Promise<DingTalkIdentity> {
    const userId = authCode.startsWith("mock:")
      ? authCode.slice("mock:".length)
      : authCode;

    if (!userId.trim()) {
      throw new Error("Mock DingTalk auth code did not contain a user ID");
    }

    return { userId };
  }

  async exchangeWebAuthCode(authCode: string): Promise<DingTalkIdentity> {
    return this.exchangeAuthCode(authCode);
  }

  async listDirectory(): Promise<DingTalkDirectoryPage> {
    return { departments: [], users: [], hasMore: false };
  }

  async searchDirectoryUsers(): Promise<DingTalkDirectoryPage> {
    return { departments: [], users: [], hasMore: false };
  }

  async sendDirectReminder(
    input: DirectReminderInput,
  ): Promise<ReminderDelivery> {
    this.sentReminders.push(input);
    return { requestId: `mock-reminder-${this.sentReminders.length}` };
  }
}
