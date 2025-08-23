// ClickUp Data Models - Sadece ihtiyacımız olan alanlar

// Tag modeli
class ClickUpTag {
    constructor(tagData) {
        this.id = tagData.id;
        this.name = tagData.name;
        this.color = tagData.tag_fg || tagData.color || '#4f8cff'; // tag_fg'yi öncelikle kullan
        this.tag_fg = tagData.tag_fg;
        this.tag_bg = tagData.tag_bg;
        this.list_id = tagData.list_id;
        this.space_id = tagData.space_id;
        this.folder_id = tagData.folder_id;
        this.creator_id = tagData.creator_id;
        this.creator_name = tagData.creator_name;
        this.created_date = tagData.created_date;
        this.task_count = tagData.task_count;
        this.workspace_id = tagData.workspace_id;
        this.chain_id = tagData.chain_id;
        this.userid = tagData.userid;
        this.dependencies = tagData.dependencies;
        this.assignees = tagData.assignees;
        this.priority = tagData.priority;
        this.due_date = tagData.due_date;
        this.description = tagData.description;
    }
}

// Task modeli
class ClickUpTask {
    constructor(taskData) {
        this.id = taskData.id;
        this.name = taskData.name;
        this.status = taskData.status?.status || 'Unknown';
        this.priority = taskData.priority || 'Normal';
        this.assignee = taskData.assignees?.[0]?.username || 'Unassigned';
        this.dueDate = taskData.due_date ? new Date(parseInt(taskData.due_date)).toISOString().split('T')[0] : 'No due date';
        this.type = taskData.type || 'Task';
        this.tags = taskData.tags || [];
        this.creator = taskData.creator;
        this.dateCreated = taskData.date_created;
        this.dateUpdated = taskData.date_updated;
        this.description = taskData.description;
        this.dependencies = taskData.dependencies || [];
        this.workspaceId = taskData.workspace_id;
        this.chainId = taskData.chain_id;
        this.userId = taskData.userid;
    }
}

// User modeli
class ClickUpUser {
    constructor(userData) {
        this.id = userData.id;
        this.username = userData.username;
        this.email = userData.email;
        this.color = userData.color;
    }
}

module.exports = { ClickUpTag, ClickUpTask, ClickUpUser }; 