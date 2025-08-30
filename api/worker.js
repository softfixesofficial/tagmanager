// Cloudflare Workers API
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    console.log(`[Worker] Request: ${request.method} ${path}`);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*', // Local ve production için
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // OAuth login endpoint
    if (path === '/login/clickup' && request.method === 'GET') {
      console.log('[Worker] OAuth login requested');
      
      const oauthUrl = `https://app.clickup.com/api?client_id=${encodeURIComponent(env.CLICKUP_CLIENT_ID)}&redirect_uri=${encodeURIComponent(env.CLICKUP_REDIRECT_URI)}`;
      
      console.log('[Worker] OAuth URL:', oauthUrl);
      
      return new Response(JSON.stringify({ url: oauthUrl }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Token exchange endpoint
    if (path === '/api/clickup/token' && request.method === 'POST') {
      console.log('[Worker] Token exchange requested');
      
      const { code } = await request.json();
      
      if (!code) {
        return new Response(JSON.stringify({ error: 'No authorization code provided' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      try {
        console.log('[Worker] Exchanging code for token...');
        
        const response = await fetch('https://api.clickup.com/api/v2/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            client_id: env.CLICKUP_CLIENT_ID,
            client_secret: env.CLICKUP_CLIENT_SECRET,
            code: code
          })
        });

        const data = await response.json();
        console.log('[Worker] Token exchange response:', data);
        
        return new Response(JSON.stringify(data), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (err) {
        console.error('[Worker] Token exchange error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // Get tags endpoint
    if (path === '/api/clickup/tags' && request.method === 'GET') {
      console.log('[Worker] Tags requested');
      
      const token = url.searchParams.get('token');
      if (!token) {
        return new Response(JSON.stringify({ error: 'No token provided' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      try {
        console.log('[Worker] Fetching tags from ClickUp...');
        
        // Get teams first
        const teamsResponse = await fetch('https://api.clickup.com/api/v2/team', {
          headers: { 'Authorization': token }
        });
        const teamsData = await teamsResponse.json();
        const teamId = teamsData.teams[0]?.id;
        
        if (!teamId) {
          return new Response(JSON.stringify({ error: 'No team found' }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        // Get spaces for the team
        const spacesResponse = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space`, {
          headers: { 'Authorization': token }
        });
        const spacesData = await spacesResponse.json();
        
        let allTags = [];
        
        // Extract tags from tasks in all spaces
        for (const space of spacesData.spaces || []) {
          // Get space lists
          const spaceListsResponse = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/list`, {
            headers: { 'Authorization': token }
          });
          const spaceListsData = await spaceListsResponse.json();
          
          for (const list of spaceListsData.lists || []) {
            const tasksResponse = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task`, {
              headers: { 'Authorization': token }
            });
            const tasksData = await tasksResponse.json();
            
            for (const task of tasksData.tasks || []) {
              if (task.tags && task.tags.length > 0) {
                for (const tag of task.tags) {
                  const tagId = tag.name;
                  const existingTag = allTags.find(t => t.id === tagId);
                  if (!existingTag) {
                    const tagData = {
                      ...tag,
                      id: tagId,
                      list_id: list.id,
                      space_id: space.id,
                      task_count: 1
                    };
                    allTags.push(tagData);
                  } else {
                    existingTag.task_count++;
                  }
                }
              }
            }
          }
        }
        
        console.log('[Worker] Tags found:', allTags.length);
        
        return new Response(JSON.stringify({ tags: allTags }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (err) {
        console.error('[Worker] Tags fetch error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // 404 for unknown routes
    console.log('[Worker] 404 - Route not found:', path);
    return new Response('Not Found', { status: 404 });
  }
};
