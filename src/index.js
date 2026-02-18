import dotenv from 'dotenv'
import path from 'path'
import { google } from "googleapis"
import { DateTime } from 'luxon';

// dotenv.config({ path: path.resolve(process.cwd(), '../.env') }); // only for dev env should be commented for prod

const SESSION_COOKIE = process.env.LEETCODE_SESSION_COOKIE
const CSRF_TOKEN = process.env.LEETCODE_CSRF_TOKEN
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN
const USERNAME = process.env.LEETCODE_USERNAME

const allQuestionsMap = {}

async function getAllQuestion() {
    try {
        const response = await fetch("https://leetcode.com/graphql/", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Referer': 'https://leetcode.com',
                'x-csrftoken': CSRF_TOKEN,
                'Cookie': `LEETCODE_SESSION=${SESSION_COOKIE}; csrftoken=${CSRF_TOKEN}`
            },
            body: JSON.stringify({ query: "query { allQuestions { titleSlug questionId difficulty } }" })
        });

        if (!response.ok) {
            console.error(`❌ Failed to fetch questions: ${response.status} ${response.statusText}`);
            return;
        }

        const data = await response.json();
        const allQuestions = data.data.allQuestions || [];
        allQuestions.forEach(question => {
            allQuestionsMap[question.titleSlug] = { id: question.questionId, difficulty: question.difficulty };
        });
        console.log(`✅ Loaded ${allQuestions.length} questions.`);
    } catch (error) {
        console.error("❌ Error in getAllQuestion:", error);
    }
}

async function fetchSubmissions() {
    const query = `
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

    const variables = { username: USERNAME, "limit": 50 }

    const response = await fetch("https://leetcode.com/graphql/",

        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Referer': 'https://leetcode.com',
                'x-csrftoken': CSRF_TOKEN,
                'Cookie': `LEETCODE_SESSION=${SESSION_COOKIE}; csrftoken=${CSRF_TOKEN}`
            },
            body: JSON.stringify({ query: query, variables: variables, operationName: "recentAcSubmissions" })
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
            // if (questionData && questionData.difficulty === 'Easy') {
            //     return false;
            // }
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

async function createReminder(problems) {


    const oauthclient = new google.auth.OAuth2(
        CLIENT_ID,
        CLIENT_SECRET
    )

    oauthclient.setCredentials({ refresh_token: REFRESH_TOKEN })

    const calendar = google.calendar({ version: "v3", auth: oauthclient })

    const dates = [3, 7, 15];

    const baseTime = DateTime.now().setZone("Asia/Kolkata").minus({ days: 1 }).set({ hour: 21, minute: 30, second: 0, millisecond: 0 });


    for (const date of dates) {
        const startTime = baseTime.plus({ days: date });
        const endTime = startTime.plus({ minutes: 30 });

        const event = {
            summary: "LeetCode Revision",
            description: `Problems solved on ${baseTime.toFormat("dd-LL-yyyy")}:\n${problems.join('\n')}`,
            start: { dateTime: startTime.toISO(), timeZone: "Asia/Kolkata" },
            end: { dateTime: endTime.toISO(), timeZone: "Asia/Kolkata" },
            colorId: "5" // Yellow
        };

        try {
            await calendar.events.insert({
                calendarId: 'primary',
                resource: event
            }).then((res) => {
                if (res.status === 200) console.log(`✅ Created event for ${startTime.toFormat("dd-LL-yyyy")}`);
                else console.log(`⚠️ Request sent but status was ${res.status} for ${startTime.toFormat("dd-LL-yyyy")}`);
            });
        } catch (err) {
            console.error(`❌ Failed for ${startTime.toFormat("dd-LL-yyyy")}:`, err.message);
        }
    }
}

(async () => {
    try {
        console.log("🚀 Starting LeetCode Tracker...");
        await getAllQuestion();
        const problems = await fetchSubmissions();

        if (problems.length === 0) {
            console.log('ℹ️ No problems solved yesterday.');
        } else {
            console.log(`🔍 Found ${problems.length} problems solved yesterday:`, problems);
            await createReminder(problems);
        }
    } catch (err) {
        console.error("❌ Fatal Error:", err);
        process.exit(1);
    }
})();
