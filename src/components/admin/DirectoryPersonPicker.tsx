"use client";

import {
  Button,
  MessageBar,
  MessageBarBody,
  Radio,
  SearchBox,
  Spinner,
} from "@fluentui/react-components";
import { PeopleCommunityRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import type {
  DirectoryDepartment,
  DirectoryUser as ApiDirectoryUser,
} from "@/lib/client/types";
import styles from "./DirectoryPersonPicker.module.css";

export interface DirectoryPerson {
  dingtalkUserId: string;
  name: string;
  department: string | null;
  title?: string;
}

interface DirectoryLocation {
  id: string;
  name: string;
}

const directoryRoot: DirectoryLocation = { id: "1", name: "企业通讯录" };

const mockDirectory: DirectoryPerson[] = [
  { dingtalkUserId: "dt_mock_directory_01", name: "郑博文", department: "前沿研究中心" },
  { dingtalkUserId: "dt_mock_directory_02", name: "沈嘉禾", department: "工程创新中心" },
  { dingtalkUserId: "dt_mock_directory_03", name: "蒋文博", department: "人工智能研究院" },
  { dingtalkUserId: "dt_mock_directory_04", name: "丁若楠", department: "科研管理部" },
  { dingtalkUserId: "dt_mock_directory_05", name: "谢承宇", department: "先进制造实验室" },
  { dingtalkUserId: "dt_mock_directory_06", name: "宋思远", department: "成果转化中心" },
  { dingtalkUserId: "dt_mock_directory_07", name: "韩雨薇", department: "数字技术中心" },
  { dingtalkUserId: "dt_mock_directory_08", name: "许正阳", department: "质量与标准部" },
];

function initials(name: string) {
  return name.trim().slice(-2);
}

function parseDingTalkPerson(raw: unknown): DirectoryPerson | null {
  const payload = raw as Record<string, unknown> | Array<Record<string, unknown>>;
  const candidate = Array.isArray(payload)
    ? payload[0]
    : Array.isArray(payload.users)
      ? (payload.users as Array<Record<string, unknown>>)[0]
      : payload;
  if (!candidate) return null;
  const id = candidate.emplId ?? candidate.userId ?? candidate.userid;
  if (typeof id !== "string" || typeof candidate.name !== "string") return null;
  return {
    dingtalkUserId: id,
    name: candidate.name,
    department: typeof candidate.department === "string" ? candidate.department : null,
  };
}

export function DirectoryPersonPicker({
  open,
  mockMode,
  corpId,
  excludedUserIds,
  selected,
  onSelect,
}: {
  open: boolean;
  mockMode: boolean;
  corpId?: string | null;
  excludedUserIds?: string[];
  selected: DirectoryPerson | null;
  onSelect: (person: DirectoryPerson) => void;
}) {
  const [query, setQuery] = useState("");
  const [isInDingTalk, setIsInDingTalk] = useState(false);
  const [path, setPath] = useState<DirectoryLocation[]>([directoryRoot]);
  const [departments, setDepartments] = useState<DirectoryDepartment[]>([]);
  const [users, setUsers] = useState<DirectoryPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<number | undefined>();
  const [searchUsers, setSearchUsers] = useState<DirectoryPerson[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchCursor, setSearchCursor] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const searchRequest = useRef(0);
  const excluded = useMemo(() => new Set(excludedUserIds ?? []), [excludedUserIds]);

  useEffect(() => {
    if (mockMode) return;
    let active = true;
    void import("dingtalk-jsapi")
      .then((dd) => {
        if (active) setIsInDingTalk(dd.env.platform !== "notInDingTalk");
      })
      .catch(() => {
        if (active) setIsInDingTalk(false);
      });
    return () => { active = false; };
  }, [mockMode]);

  const loadDirectory = useCallback(async (
    location: DirectoryLocation,
    nextCursor = 0,
    append = false,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.dingtalkDirectory(location.id, nextCursor);
      const pageUsers = page.users.map((user: ApiDirectoryUser) => ({
        dingtalkUserId: user.userId,
        name: user.name,
        department: location.name,
      }));
      setDepartments(page.departments);
      setUsers((current) => append ? [...current, ...pageUsers] : pageUsers);
      setHasMore(page.hasMore);
      setCursor(page.nextCursor);
    } catch (requestError) {
      setError(errorMessage(requestError));
      if (!append) {
        setDepartments([]);
        setUsers([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const searchDirectory = useCallback(async (
    searchQuery: string,
    nextCursor = 0,
    append = false,
  ) => {
    const requestId = ++searchRequest.current;
    setSearchLoading(true);
    setError(null);
    try {
      const page = await api.searchDingtalkDirectory(searchQuery, nextCursor);
      if (requestId !== searchRequest.current) return;
      const pageUsers = page.users.map((user: ApiDirectoryUser) => ({
        dingtalkUserId: user.userId,
        name: user.name,
        department: user.department ?? null,
        ...(user.title ? { title: user.title } : {}),
      }));
      setSearchUsers((current) => append ? [...current, ...pageUsers] : pageUsers);
      setSearchHasMore(page.hasMore);
      setSearchCursor(page.nextCursor);
    } catch (requestError) {
      if (requestId !== searchRequest.current) return;
      setError(errorMessage(requestError));
      if (!append) setSearchUsers([]);
    } finally {
      if (requestId === searchRequest.current) setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setPath([directoryRoot]);
    setDepartments([]);
    setUsers([]);
    setSearchUsers([]);
    setSearchHasMore(false);
    setSearchCursor(undefined);
    setError(null);
    if (!mockMode) void loadDirectory(directoryRoot);
  }, [loadDirectory, mockMode, open]);

  useEffect(() => {
    if (mockMode || !open) return;
    const searchQuery = query.trim();
    if (!searchQuery) {
      searchRequest.current += 1;
      setSearchUsers([]);
      setSearchHasMore(false);
      setSearchCursor(undefined);
      setSearchLoading(false);
      return;
    }
    searchRequest.current += 1;
    setSearchLoading(true);
    const timer = window.setTimeout(() => void searchDirectory(searchQuery), 300);
    return () => window.clearTimeout(timer);
  }, [mockMode, open, query, searchDirectory]);

  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const source = mockMode
      ? mockDirectory.filter((user) => !normalized || `${user.name}${user.department ?? ""}`.toLowerCase().includes(normalized))
      : normalized
        ? searchUsers
        : users;
    return source.filter((user) => !excluded.has(user.dingtalkUserId));
  }, [excluded, mockMode, query, searchUsers, users]);

  function enterDepartment(department: DirectoryDepartment) {
    const location = { id: department.id, name: department.name };
    setPath((current) => [...current, location]);
    setQuery("");
    void loadDirectory(location);
  }

  function returnToDirectory(index: number) {
    const location = path[index];
    if (!location) return;
    setPath((current) => current.slice(0, index + 1));
    setQuery("");
    void loadDirectory(location);
  }

  async function chooseFromDingTalk() {
    setError(null);
    try {
      if (!corpId) throw new Error("缺少钉钉企业 ID，请联系管理员检查配置");
      const dd = await import("dingtalk-jsapi");
      if (dd.env.platform === "notInDingTalk") throw new Error("当前浏览器无法使用钉钉客户端选择器");
      const raw = await dd.biz.contact.choose({
        corpId,
        multiple: false,
        max: 1,
        users: [],
        startWithDepartmentId: 0,
      });
      const person = parseDingTalkPerson(raw);
      if (!person) throw new Error("未选择人员，或钉钉未返回有效的人员信息");
      if (excluded.has(person.dingtalkUserId)) throw new Error("该人员已是发起人，请选择其他人员");
      onSelect(person);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  const busy = loading || searchLoading;

  return (
    <div className={styles.picker}>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {!mockMode && (
        <div className={styles.toolbar}>
          <div className={styles.breadcrumbs} aria-label="通讯录位置">
            {path.map((location, index) => (
              <span key={location.id}>
                {index > 0 && <span className={styles.separator}>/</span>}
                <button
                  type="button"
                  onClick={() => returnToDirectory(index)}
                  disabled={index === path.length - 1 || loading}
                >
                  {location.name}
                </button>
              </span>
            ))}
          </div>
          {isInDingTalk && (
            <Button appearance="secondary" size="small" onClick={() => void chooseFromDingTalk()}>
              使用钉钉选择器
            </Button>
          )}
        </div>
      )}
      <SearchBox
        value={query}
        onChange={(_, data) => setQuery(data.value)}
        placeholder="搜索姓名"
        aria-label="搜索企业通讯录人员"
      />
      <div className={styles.list} aria-busy={busy}>
        {!mockMode && !query.trim() && departments.map((department) => (
          <button
            type="button"
            className={styles.departmentRow}
            key={department.id}
            onClick={() => enterDepartment(department)}
            disabled={loading}
          >
            <PeopleCommunityRegular />
            <span><strong>{department.name}</strong><small>进入部门选择人员</small></span>
            <span aria-hidden="true">›</span>
          </button>
        ))}
        {visibleUsers.map((person) => (
          <label className={styles.personRow} key={person.dingtalkUserId}>
            <Radio
              checked={selected?.dingtalkUserId === person.dingtalkUserId}
              onChange={() => onSelect(person)}
              aria-label={`选择${person.name}`}
            />
            <span className={styles.avatar}>{initials(person.name)}</span>
            <span><strong>{person.name}</strong><small>{person.department || person.title || "钉钉通讯录"}</small></span>
          </label>
        ))}
        {busy && <div className={styles.loading}><Spinner size="small" label={query.trim() ? "正在搜索通讯录" : "正在读取通讯录"} /></div>}
        {!busy && (!mockMode ? (!query.trim() ? departments.length === 0 : true) : true) && visibleUsers.length === 0 && (
          <p className={styles.empty}>{query.trim() ? "未找到匹配的企业通讯录人员" : "当前部门暂无可选择人员"}</p>
        )}
        {!mockMode && !query.trim() && !loading && hasMore && cursor !== undefined && (
          <Button appearance="subtle" className={styles.loadMore} onClick={() => void loadDirectory(path.at(-1) ?? directoryRoot, cursor, true)}>
            加载更多人员
          </Button>
        )}
        {!mockMode && query.trim() && !searchLoading && searchHasMore && searchCursor !== undefined && (
          <Button appearance="subtle" className={styles.loadMore} onClick={() => void searchDirectory(query.trim(), searchCursor, true)}>
            加载更多搜索结果
          </Button>
        )}
      </div>
      {selected && (
        <div className={styles.selection} aria-live="polite">
          <span className={styles.avatar}>{initials(selected.name)}</span>
          <span><strong>已选择 {selected.name}</strong><small>{selected.department || selected.title || "钉钉通讯录"}</small></span>
          <span className={styles.selectedMark}>已选</span>
        </div>
      )}
    </div>
  );
}
