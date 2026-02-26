// import dotenv from 'dotenv'
// import path from 'path'
import { google } from "googleapis"
import { DateTime } from 'luxon';

// dotenv.config({ path: path.resolve(process.cwd(), '../.env') }); // only for dev env should be commented for prod

export async function getAllQuestion({ leetcodeURL, leetcodeReferer, leetcodeQuery, csrfToken, sessionCookie}) {
    try {
        const response = await fetch(leetcodeURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Referer': leetcodeReferer,
                'x-csrftoken': csrfToken,
                'Cookie': `LEETCODE_SESSION=${sessionCookie}; csrftoken=${csrfToken}`
            },
            body: JSON.stringify({ query: leetcodeQuery })
        });

        if (!response.ok) {
            console.error(`❌ Failed to fetch questions: ${response.status} ${response.statusText}`);
            return;
        }

        const data = await response.json();
        const allQuestions = data.data.allQuestions || [];
        const allQuestionsMap = {};
        allQuestions.forEach(question => {
            allQuestionsMap[question.titleSlug] = { id: question.questionId, difficulty: question.difficulty };
        });
        console.log(`✅ Loaded ${allQuestions.length} questions.`);
        return allQuestionsMap;
    } catch (error) {
        console.error("❌ Error in getAllQuestion:", error);
    }
}

export async function fetchSubmissions({ leetcodeURL, leetcodeReferer, leetcodeQuery, leetcodeUserName, csrfToken, sessionCookie, allQuestionsMap }) {

    const variables = { username: leetcodeUserName, "limit": 50 }

    const response = await fetch(leetcodeURL,

        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Referer': leetcodeReferer,
                'x-csrftoken': csrfToken,
                'Cookie': `LEETCODE_SESSION=${sessionCookie}; csrftoken=${csrfToken}`
            },
            body: JSON.stringify({ query: leetcodeQuery, variables: variables, operationName: "recentAcSubmissions" })
        }
    )

    if (response.status === 403) {
        console.error('⚠️  Authentication failed. Cookie may have expired.');
        process.exit(1);
    }

    const data = await response.json();
    const submissions = data.data.recentAcSubmissionList;

    const now = DateTime.now().setZone("Asia/Kolkata");
    const startOfToday = now.startOf('day').toSeconds();
    const startOfYesterday = startOfToday - 24 * 60 * 60;

    const yesterdaySubs = submissions.filter(
        s => {
            const timestamp = Number(s.timestamp);
            const isYesterday = timestamp >= startOfYesterday && timestamp < startOfToday;
            if (!isYesterday) return false;

            const questionData = allQuestionsMap[s.titleSlug];
            // If we don't have data, assume we keep it (or discard safely?). 
            // But usually we should have it. Let's filter if difficulty is Easy.
            // commented for testing
            if (questionData && questionData.difficulty === 'Easy') {
                return false;
            }
            return true;
        }
    );

    const uniqueQs = [...new Set(yesterdaySubs.map(
        s => {
            const questionData = allQuestionsMap[s.titleSlug];
            return questionData ? `${questionData.id}. ${s.title} (${questionData.difficulty})` : s.title;
        }
    ))];

    return uniqueQs;
}

export async function createReminder({problems, googleClientID, googleClientSecret, googleRefreshToken}) {


    const oauthclient = new google.auth.OAuth2(
        googleClientID,
        googleClientSecret
    )

    oauthclient.setCredentials({ refresh_token: googleRefreshToken })

    const calendar = google.calendar({ version: "v3", auth: oauthclient })

    const dates = [3, 7, 15];

    const baseTime = DateTime.now().setZone("Asia/Kolkata").minus({ days: 1 }).set({ hour: 21, minute: 30, second: 0, millisecond: 0 });


    for (const date of dates) {
        const startTime = baseTime.plus({ days: date });
        const endTime = startTime.plus({ minutes: 30 });
        const targetDateISO = startTime.toISODate(); // "YYYY-MM-DD"

        try {
            // 🔍 Search for existing event on this day with exact summary
            const eventsRes = await calendar.events.list({
                calendarId: 'primary',
                timeMin: startTime.minus({ hours: 1 }).toISO(), // Search around the time
                timeMax: endTime.plus({ hours: 1 }).toISO(),
                q: "LeetCode Revision",
                singleEvents: true,
            });

            const existingEvent = eventsRes.data.items && eventsRes.data.items.find(e => e.summary === "LeetCode Revision");

            if (existingEvent) {
                console.log(`ℹ️ Finding existing event for ${targetDateISO}... Found! Updating...`);

                // Append new problems to existing description
                const oldDescription = existingEvent.description || "";

                // Avoid duplicating if script runs multiple times
                const newProblems = problems.filter(p => !oldDescription.includes(p));

                if (newProblems.length === 0) {
                    console.log(`⚠️ No new problems to add for ${targetDateISO}.`);
                    continue;
                }

                const updatedDescription = `${oldDescription}\n\nProblems solved on ${baseTime.toFormat("dd-LL-yyyy")}:\n${newProblems.join('\n')}`;

                await calendar.events.patch({
                    calendarId: 'primary',
                    eventId: existingEvent.id,
                    resource: {
                        description: updatedDescription
                    }
                });
                console.log(`✅ Updated event for ${targetDateISO}`);

            } else {
                // 🆕 Create New Event
                console.log(`ℹ️ No existing event for ${targetDateISO}. Creating new...`);
                const event = {
                    summary: "LeetCode Revision",
                    description: `Problems solved on ${baseTime.toFormat("dd-LL-yyyy")}:\n${problems.join('\n')}`,
                    start: { dateTime: startTime.toISO(), timeZone: "Asia/Kolkata" },
                    end: { dateTime: endTime.toISO(), timeZone: "Asia/Kolkata" },
                    colorId: "5" // Yellow
                };

                await calendar.events.insert({
                    calendarId: 'primary',
                    resource: event
                }).then((res) => {
                    if (res.status === 200) console.log(`✅ Created event for ${targetDateISO}`);
                    else console.log(`⚠️ Request sent but status was ${res.status} for ${targetDateISO}`);
                });
            }

        } catch (err) {
            console.error(`❌ Failed for ${targetDateISO}:`, err.message);
            process.exit(1);
        }
    }
}

export async function scheduleForRevision () {
    const LEETCODE_URL = "https://leetcode.com/graphql/";
    const LEETCODE_REFERER = "https://leetcode.com";
    const LEETCODE_QUESTIONS_QUERY = "query { allQuestions { titleSlug questionId difficulty } }";
    const LEETCODE_SUBMISSIONS_QUERY = `
    query recentAcSubmissions($username: String!, $limit: Int!) 
    { 
        recentAcSubmissionList(username: $username, limit: $limit) 
        { 
            id 
            title 
            titleSlug 
            timestamp 
        } 
    }`
    const CSRF_TOKEN = process.env.LEETCODE_CSRF_TOKEN;
    const SESSION_COOKIE = process.env.LEETCODE_SESSION_COOKIE;
    const LEETCODE_USERNAME = process.env.LEETCODE_USERNAME;
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN

    try {
        console.log("🚀 Starting LeetCode Tracker...");
        const questionsResult = await getAllQuestion({
          leetcodeURL: LEETCODE_URL,
          leetcodeReferer: LEETCODE_REFERER,
          leetcodeQuery: LEETCODE_QUESTIONS_QUERY,
          csrfToken: CSRF_TOKEN,
          sessionCookie: SESSION_COOKIE,
        });
        const problems = await fetchSubmissions({
          leetcodeURL: LEETCODE_URL,
          leetcodeReferer: LEETCODE_REFERER,
          leetcodeQuery: LEETCODE_SUBMISSIONS_QUERY,
          leetcodeUserName: LEETCODE_USERNAME,
          csrfToken: CSRF_TOKEN,
          sessionCookie: SESSION_COOKIE,
          allQuestionsMap: questionsResult, // also this was wrong — you had questionsResult but function expects allQuestionsMap
        });

        if (problems.length === 0) {
            console.log('ℹ️ No problems solved yesterday.');
        } else {
            console.log(`🔍 Found ${problems.length} problems solved yesterday:`, problems);
            await createReminder({
                problems: problems,
                googleClientID: GOOGLE_CLIENT_ID,
                googleClientSecret: GOOGLE_CLIENT_SECRET,
                googleRefreshToken: GOOGLE_REFRESH_TOKEN
            });
        }
    } catch (err) {
        console.error("❌ Fatal Error:", err);
        process.exit(1);
    }
}
