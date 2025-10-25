import dotenv from 'dotenv'
import path from 'path'
import { google } from "googleapis"

dotenv.config({ path: path.resolve(process.cwd(), '../.env') }); // only for dev env should be commented for prod

const SESSION_COOKIE = process.env.LEETCODE_SESSION_COOKIE
const CSRF_TOKEN = process.env.LEETCODE_CSRF_TOKEN
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN

const allQuestionsMap = {}

async function getAllQuestion() {
    const response = await fetch("https://leetcode.com/graphql/", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Referer': 'https://leetcode.com',
            'x-csrftoken': CSRF_TOKEN,
            'Cookie': `LEETCODE_SESSION=${SESSION_COOKIE}; csrftoken=${CSRF_TOKEN}`
        },
        body: JSON.stringify({ query: "query { allQuestions { titleSlug questionId } }" })
    })

    const data = await response.json()

    const allQuestions = data.data.allQuestions || [];
    allQuestions.forEach(question => {
        allQuestionsMap[question.titleSlug] = question.questionId
    });

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

    const variables = { username: "yuvaraaj5910", "limit": 50 }

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

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    const startOfYesterday = startOfToday - 24 * 60 * 60;

    const yesterdaySubs = submissions.filter(s => s.timestamp >= startOfYesterday && s.timestamp < startOfToday);
    const uniqueQs = [...new Set(yesterdaySubs.map(s => `${allQuestionsMap[s.titleSlug]} ${s.title}`))];

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

    const now = new Date();
    const baseTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 21, 30); // 9 AM today


    for (const date of dates) {
        const nextDate = new Date(baseTime);
        nextDate.setDate(baseTime.getDate() + date);
        const startTime = new Date(nextDate);
        const endTime = new Date(nextDate.getTime() + 30 * 60 * 1000); // 30 min event
        const event = {
            summary: `LeetCode Revision`,
            description: `Problems solved on ${baseTime.getDate()}-${baseTime.getMonth() + 1}-${baseTime.getFullYear()}:\n${problems.join('\n')}`,
            start: { dateTime: startTime.toISOString(), timeZone: 'Asia/Kolkata' },
            end: { dateTime: endTime.toISOString(), timeZone: 'Asia/Kolkata' },
            colorId: 5
        };

        try {
            await calendar.events.insert({
                calendarId: 'primary',
                resource: event
            }).then((res)=>{
                if(res.ok) console.log(`✅ Created event on ${startTime.toLocaleString('en-IN')}`)});
        } catch (err) {
            console.error(`❌ Failed for day ${offset}:`, err.message);
        }
    }
}

(async () => {
    try {
        const _ = await getAllQuestion();
        const problems = await fetchSubmissions();
        console.log(problems)
        if (problems.length === 0) {
            console.log('No problems solved yesterday.');
            return;
        }
        await createReminder(problems);
    } catch (err) {
        console.error(err);
    }
})();
