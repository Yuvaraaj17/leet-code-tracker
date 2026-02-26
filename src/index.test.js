import {
  describe,
  it,
  expect,
  jest,
  beforeAll,
  afterAll,
  afterEach,
} from "@jest/globals";

import { DateTime, Settings } from "luxon";
import { google } from "googleapis";

/* -------------------------------------------------
   GOOGLE MOCK (must be before importing the module)
------------------------------------------------- */

const events = {
  list: jest.fn(),
  patch: jest.fn(),
  insert: jest.fn(),
};

jest.unstable_mockModule("googleapis", () => ({
  google: {
    auth: {
      OAuth2: jest.fn(() => ({
        setCredentials: jest.fn(),
      })),
    },
    calendar: jest.fn(() => ({
      events,
    })),
  },
}));

/* -------------------------------------------------
   IMPORT MODULE UNDER TEST AFTER MOCK
------------------------------------------------- */

import { getAllQuestion, fetchSubmissions, createReminder, scheduleForRevision } from "./index.js";

/* -------------------------------------------------
   TIME FREEZE
------------------------------------------------- */

beforeAll(() => {
  Settings.now = () => new Date("2025-01-10T10:00:00Z").valueOf();
});

afterAll(() => {
  Settings.now = () => Date.now();
});

/* -------------------------------------------------
   CLEANUP
------------------------------------------------- */

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

jest.mock("googleapis");

/* =================================================
   getAllQuestion
================================================= */

describe("getAllQuestion", () => {
  it("should fetch and return all questions", async () => {
    const mockResponse = {
      data: {
        allQuestions: [
          { titleSlug: "two-sum", questionId: "1", difficulty: "Easy" },
          { titleSlug: "add-two-numbers", questionId: "2", difficulty: "Medium" },
        ],
      },
    };

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })
    );

    const result = await getAllQuestion({
      leetcodeURL: "https://leetcode.com/graphql",
      leetcodeReferer: "https://leetcode.com/problemset/all/",
      leetcodeQuery: "query { allQuestions { titleSlug questionId difficulty } }",
      csrfToken: "mock-csrf-token",
      sessionCookie: "mock-session-cookie",
    });

    expect(result).toEqual({
      "two-sum": { id: "1", difficulty: "Easy" },
      "add-two-numbers": { id: "2", difficulty: "Medium" },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("should handle fetch errors gracefully", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("Network error")));

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await getAllQuestion({
      leetcodeURL: "https://leetcode.com/graphql",
      leetcodeReferer: "https://leetcode.com/problemset/all/",
      leetcodeQuery: "query { allQuestions { titleSlug questionId difficulty } }",
      csrfToken: "mock-csrf-token",
      sessionCookie: "mock-session-cookie",
    });

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      "❌ Error in getAllQuestion:",
      expect.any(Error)
    );
  });
});

/* =================================================
   fetchSubmissions
================================================= */

describe("fetchSubmissions", () => {
  it("should fetch and return recent submissions", async () => {
    const ts = DateTime.now()
      .setZone("Asia/Kolkata")
      .minus({ days: 1 })
      .toSeconds();

    const mockResponse = {
      data: {
        recentAcSubmissionList: [
          { title: "Two Sum", titleSlug: "two-sum", timestamp: ts },
          { title: "Add Two Numbers", titleSlug: "add-two-numbers", timestamp: ts },
        ],
      },
    };

    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 200,
        json: () => Promise.resolve(mockResponse),
      })
    );

    const result = await fetchSubmissions({
      leetcodeURL: "https://leetcode.com/graphql",
      leetcodeReferer: "https://leetcode.com/submissions/",
      leetcodeQuery:
        "query recentAcSubmissions($username: String!, $limit: Int!) { recentAcSubmissionList(username: $username, limit: $limit) { titleSlug timestamp } }",
      leetcodeUserName: "mock-user",
      csrfToken: "mock-csrf-token",
      sessionCookie: "mock-session-cookie",
      allQuestionsMap: {
        "two-sum": { id: "1", difficulty: "Easy" },
        "add-two-numbers": { id: "2", difficulty: "Medium" },
      },
    });

    expect(result).toEqual(["2. Add Two Numbers (Medium)"]);
  });

  it("should handle authentication errors gracefully", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ status: 403 }));

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const exitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation(() => {
        throw new Error("process.exit");
      });

    await expect(
      fetchSubmissions({
        leetcodeURL: "https://leetcode.com/graphql",
        leetcodeReferer: "https://leetcode.com/submissions/",
        leetcodeQuery: "query ...",
        leetcodeUserName: "mock-user",
        csrfToken: "mock-csrf-token",
        sessionCookie: "mock-session-cookie",
        allQuestionsMap: {},
      })
    ).rejects.toThrow("process.exit");

    expect(consoleSpy).toHaveBeenCalledWith(
      "⚠️  Authentication failed. Cookie may have expired."
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

/* =================================================
   createReminder
================================================= */

describe("createReminder", () => {
  it("creates events when none exist", async () => {
    const mockSetCredentials = jest.fn();

    google.auth.OAuth2 = jest.fn().mockImplementation(() => ({
      setCredentials: mockSetCredentials,
    }));

    google.calendar = jest.fn().mockImplementation(()=> {
        return { events: {
            list: jest.fn().mockResolvedValue({ data: { items: [] } }),
            insert: jest.fn().mockResolvedValue({ status: 200 }),
            patch: jest.fn()
        }}
    })

    await createReminder(
      ["1. Two Sum (Easy)"],
      "id",
      "secret",
      "refreshToken"
    );

    const calendarInstance = google.calendar.mock.results[0].value;

    expect(mockSetCredentials).toHaveBeenCalledWith({ refresh_token: 'refreshToken' })
    expect(calendarInstance.events.list).toHaveBeenCalledTimes(3);
    expect(calendarInstance.events.insert).toHaveBeenCalledTimes(3); // 3 because dates = [3, 7, 15]
    expect(calendarInstance.events.patch).not.toHaveBeenCalled();
  });

  it("updates event when it already exists", async () => {
    const mockSetCredentials = jest.fn();

    google.auth.OAuth2 = jest.fn().mockImplementation(() => ({
      setCredentials: mockSetCredentials,
    }));

    google.calendar = jest.fn().mockImplementation(()=> {
        return { events: {
            list: jest.fn().mockResolvedValue({ data: { items: [
          {
            id: "event1",
            summary: "LeetCode Revision",
            description: "old text",
          },
        ] } }),
            insert: jest.fn().mockResolvedValue({ status: 200 }),
            patch: jest.fn()
        }}
    })

    await createReminder(
      ["2. Add Two Numbers (Medium)"],
      "id",
      "secret",
      "refreshToken"
    );

    const calendarInstance = google.calendar.mock.results[0].value;

    expect(mockSetCredentials).toHaveBeenCalledWith({ refresh_token: 'refreshToken' })
    expect(calendarInstance.events.list).toHaveBeenCalledTimes(3);
    expect(calendarInstance.events.patch).toHaveBeenCalledTimes(3); // 3 because dates = [3, 7, 15]
    expect(calendarInstance.events.insert).not.toHaveBeenCalled();

  });

  it("does not update when problems already exist", async () => {
    events.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "event1",
            summary: "LeetCode Revision",
            description: "2. Add Two Numbers (Medium)",
          },
        ],
      },
    });

    await createReminder(
      ["2. Add Two Numbers (Medium)"],
      "id",
      "secret",
      "refreshToken"
    );

    expect(events.patch).not.toHaveBeenCalled();
  });

  it("logs error when API fails", async () => {

    const mockSetCredentials = jest.fn();

    google.auth.OAuth2 = jest.fn().mockImplementation(() => ({
      setCredentials: mockSetCredentials,
    }));

    google.calendar = jest.fn().mockImplementation(()=> {
        return {
          events: {
            list: jest.fn().mockRejectedValue(new Error("API failure")),
            insert: jest.fn().mockResolvedValue({ status: 200 }),
            patch: jest.fn(),
          },
        };
    })



    events.list.mockRejectedValue(new Error("API failure"));

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await createReminder(["x"], "id", "secret", "refreshToken");

    expect(consoleSpy).toHaveBeenCalled();
  });
});

const setEnv = () => {
  process.env.LEETCODE_CSRF_TOKEN = "csrf";
  process.env.LEETCODE_SESSION_COOKIE = "session";
  process.env.LEETCODE_USERNAME = "user";
};

// describe("scheduleForRevision", () => {
//   it("runs full flow and creates reminders", async () => {
//     setEnv();

//     const problems = ["2. Add Two Numbers (Medium)"];

//     // 1. Setup mocks
//     getAllQuestion.mockResolvedValue({ questions: ["2. Add Two Numbers (Medium)"] }) // return fake questions
//     fetchSubmissions.mockResolvedValue(["2. Add Two Numbers (Medium)"]) // return fake problems

//     // 2. Call function
//     await scheduleForRevision()

//     // 3. Assert
//         expect(createReminder).toHaveBeenCalledWith(["2. Add Two Numbers (Medium)"])
//     });

//   it("skips reminder when no problems solved", async () => {
//     setEnv();

//     jest.spyOn(mod, "getAllQuestion").mockResolvedValue({});
//     jest.spyOn(mod, "fetchSubmissions").mockResolvedValue([]);

//     const reminderSpy = jest.spyOn(mod, "createReminder");

//     const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

//     await scheduleForRevision();

//     expect(reminderSpy).not.toHaveBeenCalled();
//     expect(logSpy).toHaveBeenCalledWith(
//       "ℹ️ No problems solved yesterday."
//     );
//   });

//   it("handles fatal error and exits", async () => {
//     setEnv();

//     jest
//       .spyOn(mod, "getAllQuestion")
//       .mockRejectedValue(new Error("boom"));

//     const consoleSpy = jest
//       .spyOn(console, "error")
//       .mockImplementation(() => {});

//     const exitSpy = jest
//       .spyOn(process, "exit")
//       .mockImplementation(() => {
//         throw new Error("process.exit");
//       });

//     await expect(scheduleForRevision()).rejects.toThrow("process.exit");

//     expect(consoleSpy).toHaveBeenCalledWith(
//       "❌ Fatal Error:",
//       expect.any(Error)
//     );

//     expect(exitSpy).toHaveBeenCalledWith(1);
//   });
// });