import axios from 'axios';
import dotenv from 'dotenv';
import { generateZohoOauthToken } from './generateZohoToken.js';
import OpenAI from "openai";
import { updateRecord, createRecord } from './zohoFunctions.js';
import { getSuperchatRecord, sendMessage } from './superchatFunctions.js';

dotenv.config();






const openai = new OpenAI();

const OPENAI_API_URL = 'https://api.openai.com/v1/';
const ZOHO_CRM_API_URL = 'https://www.zohoapis.eu/crm/v6/';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ASSISTANT = process.env.OPENAI_ASSISTANT;
const SUPERCHAT_API_KEY = process.env.SUPERCHAT_API_KEY;

const headers = {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
    'OpenAI-Beta': 'assistants=v2'
};


export async function call_in_OpenAi(mg, phone, superchat_contact_id, checker) {


    let thread_id = null;
    let ZOHO_OAUTH_TOKEN = await generateZohoOauthToken();
    console.log(ZOHO_OAUTH_TOKEN);
    var record = null;

    // Search for the record in Zoho CRM
    console.log(phone);
    try {
        const searchResponse = await axios.get(`${ZOHO_CRM_API_URL}Leads/search?phone=${phone}`, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${ZOHO_OAUTH_TOKEN}`
            }
        });
        if (searchResponse)
        {
            record = searchResponse.data.data;
            if (record && record.length > 0) {
                thread_id = record[0].Thread_Id;
                console.log('Thread ID:', thread_id);
            }
        }
    } catch (error) {
        console.error('Error searching record in Zoho CRM:', error);
    }

    // If no thread_id, create a new thread
    if (!thread_id) {
        const response = await axios.post(`${OPENAI_API_URL}threads`, {}, { headers });
        thread_id = response.data.id;

        const update_record = { Thread_Id: thread_id };

        if (record && record.length > 0) {
            const id = record[0].id;
            try {
                await axios.put(`${ZOHO_CRM_API_URL}Leads/${id}`, { data: [update_record] }, {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${ZOHO_OAUTH_TOKEN}`
                    }
                });
            } catch (error) {
                console.error('Error updating record in Zoho CRM:', error);
            }
        }
        else
        {
            update_record.Phone = phone;
            update_record.First_Name = getSuperchatRecord(superchat_contact_id).first_name ?? 'unknown';
            update_record.Last_Name = getSuperchatRecord(superchat_contact_id).last_name ?? 'unknown';
            try
            {
                const res = await axios.post(`${ZOHO_CRM_API_URL}Leads`, { data: [update_record] }, {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${ZOHO_OAUTH_TOKEN}`
                }
            });
            }
            catch (error)
            {
                console.error('Error creating record in Zoho CRM:', error);
            }
        }
    }


    // Update the thread with the new message
    let messageContent = null;
    if (mg) {
        try {
            const response1 = await openai.beta.threads.messages.create(
                thread_id,
                { role: "user", content: mg }
              );
            const message_id = response1.id;

            if (checker === 1)
            {
                const run = await openai.beta.threads.runs.create(
                    thread_id,
                    { assistant_id: OPENAI_ASSISTANT }
                  );
                var run_status = run.status;
                while (run_status !== 'completed')
                {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    run_status = (await openai.beta.threads.runs.retrieve(thread_id, run.id)).status;
                }
                const threadMessages = await openai.beta.threads.messages.list(thread_id);
                const letMessage = threadMessages.data;
                messageContent = letMessage[0].content[0].text.value;
                sendMessage(messageContent, superchat_contact_id);
            }
        } catch (error) {
            console.error('Error updating thread or retrieving messages:', error);
        }
    }
    return thread_id;
}

export async function putMessageInThreadAssistant(template_id, quickReplayBody, phone)
{
    let record = null;
    let thread_id = null;
    let ZOHO_OAUTH_TOKEN = await generateZohoOauthToken();
    try {
        const searchResponse = await axios.get(`${ZOHO_CRM_API_URL}Leads/search?phone=${phone}`, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${ZOHO_OAUTH_TOKEN}`
            }
        });
        if (searchResponse)
        {
            record = searchResponse.data.data;
            if (record && record.length > 0) {
                thread_id = record[0].Thread_Id;
                console.log('Thread ID in putMessageInThreadAssistant:', thread_id);
            }
        }
    } catch (error) {
        console.error('Error searching record in Zoho CRM in putMessageInThreadAssistant:', error);
    }

    // If no thread_id, create a new thread
    if (!thread_id)
    {
        const response = await axios.post(`${OPENAI_API_URL}threads`, {}, { headers });
        thread_id = response.data.id;

        const update_record = { Thread_Id: thread_id };
        if (record && record.length > 0) {
            const id = record[0].id;
            try {
                await axios.put(`${ZOHO_CRM_API_URL}Leads/${id}`, { data: [update_record] }, {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${ZOHO_OAUTH_TOKEN}`
                    }
                });
            } catch (error) {
                console.error('Error updating record in Zoho CRM in putMessageInThreadAssistant:', error);
            }
        }
        else
        {
            update_record.Phone = phone;
            update_record.First_Name = 'Test';
            update_record.Last_Name = 'User';
            try
            {
                const res = await axios.post(`${ZOHO_CRM_API_URL}Leads`, { data: [update_record] }, {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${ZOHO_OAUTH_TOKEN}`
                }
            });
            }
            catch (error)
            {
                console.error('Error creating record in Zoho CRM in putMessageInThreadAssistant:', error);
            }
        }
    }
    if (template_id || quickReplayBody)
    {
        let content_message = quickReplayBody;
        if (template_id)
        {
            const template_response = await getContentTemplateFromSuperchat(template_id);
            content_message = template_response.content.body;
        }
        try {
            const response1 = await openai.beta.threads.messages.create(
                thread_id,
                { role: "assistant", content: content_message }
                );
        } catch (error) {
            console.error('Error sending template message:', error);
        }
    }

    const threadMessages = await openai.beta.threads.messages.list(thread_id);
    const letMessage = threadMessages.data;
    const messageContent = letMessage[0].content[0].text.value;
    console.log('Last message should be from assistant has the value of the tempalte content:', messageContent);
}

async function getContentTemplateFromSuperchat(template_id)
{
    const options = {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'X-API-KEY': SUPERCHAT_API_KEY
        }
      };
      
      return fetch(`https://api.superchat.com/v1.0/templates/${template_id}`, options)
        .then(response => response.json())
        .catch(err => console.error(err));
}