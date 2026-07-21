export interface DingTalkIdentity {
  userId: string;
  name?: string;
  unionId?: string;
  department?: string;
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

export interface DingTalkDirectoryDepartment {
  id: string;
  name: string;
  parentId?: string;
}

export interface DingTalkDirectoryUser {
  userId: string;
  name: string;
  title?: string;
  department?: string;
}

export interface DingTalkDirectoryPage {
  departments: DingTalkDirectoryDepartment[];
  users: DingTalkDirectoryUser[];
  hasMore: boolean;
  nextCursor?: number;
}

export interface DingTalkGateway {
  exchangeAuthCode(authCode: string): Promise<DingTalkIdentity>;
  exchangeWebAuthCode(authCode: string): Promise<DingTalkIdentity>;
  getDirectoryUser(userId: string): Promise<DingTalkDirectoryUser | null>;
  searchDirectoryUsers(
    queryWord: string,
    offset?: number,
    size?: number,
  ): Promise<DingTalkDirectoryPage>;
  listDirectory(
    departmentId: number,
    cursor?: number,
    size?: number,
  ): Promise<DingTalkDirectoryPage>;
  sendDirectReminder(input: DirectReminderInput): Promise<ReminderDelivery>;
}
