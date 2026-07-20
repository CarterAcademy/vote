export interface DingTalkIdentity {
  userId: string;
  name?: string;
  unionId?: string;
}

export interface DirectReminderInput {
  userId: string;
  title: string;
  message: string;
  actionUrl: string;
}

export interface ReminderDelivery {
  requestId?: string;
}

export interface DingTalkGateway {
  exchangeAuthCode(authCode: string): Promise<DingTalkIdentity>;
  exchangeWebAuthCode(authCode: string): Promise<DingTalkIdentity>;
  sendDirectReminder(input: DirectReminderInput): Promise<ReminderDelivery>;
}
