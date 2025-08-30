// ClickUp OAuth2 access token kontrolü ve alma
(function handleClickUpAuth() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {

        fetch('https://tagmanager-api.alindakabadayi.workers.dev/api/clickup/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        })
        .then(res => res.json())
        .then(data => {
            if (data.access_token) {
                localStorage.setItem('clickup_access_token', data.access_token);
                window.location.replace(window.location.pathname);
            } else {
                showLoginSection();
            }
        })
        .catch(err => {
            console.error('[Auth] ClickUp token fetch error:', err);
            showLoginSection();
        });
    }
})();

// Login fonksiyonu
async function loginWithClickUp() {
    try {
        console.log('[Auth] Creating OAuth URL directly...');
        // Frontend'de OAuth URL oluştur (Cloudflare challenge'ı geçmek için)
        const CLICKUP_CLIENT_ID = 'E5Y5P88KKK742V28R31AR7EIWR3J0CWU';
        const CLICKUP_REDIRECT_URI = window.location.origin + '/';
        
        const oauthUrl = `https://app.clickup.com/api?client_id=${encodeURIComponent(CLICKUP_CLIENT_ID)}&redirect_uri=${encodeURIComponent(CLICKUP_REDIRECT_URI)}`;
        
        console.log('[Auth] OAuth URL:', oauthUrl);
        window.location.href = oauthUrl;
    } catch (e) {
        console.error('[Auth] Failed to get OAuth URL:', e);
    }
}

// Login section'ı göster
function showLoginSection() {
    document.getElementById('login-section').style.display = 'flex';
    document.getElementById('tag-manager-section').style.display = 'none';
}

// Tag manager section'ı göster
function showTagManagerSection() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('tag-manager-section').style.display = 'block';
}

// ClickUp görevlerini UI'a dönüştür
function mapClickUpTaskToUI(task) {
    return {
        id: task.id,
        title: task.name,
        type: task.tags && task.tags.length > 0 ? task.tags[0].name : 'Task',
        priority: task.priority && task.priority.priority ? task.priority.priority : 'Medium',
        status: task.status && task.status.status ? task.status.status : (task.status || 'To Do'),
        assignee: task.assignees && task.assignees.length > 0 ? (task.assignees[0].username || task.assignees[0].email || 'Unknown') : 'Unassigned',
        dueDate: task.due_date ? new Date(Number(task.due_date)).toISOString().slice(0, 10) : '',
        // Görseldeki gibi task ID formatı (örn: DB-501, DB-502)
        displayId: task.id ? `${task.tags && task.tags.length > 0 ? task.tags[0].name.toUpperCase() : 'TASK'}-${task.id.slice(-3)}` : task.id,
        // Tag bilgilerini sakla
        tags: task.tags || [],
        // Creator ve created date bilgileri
        creator: task.creator ? (task.creator.username || task.creator.email || 'Unknown') : 'Unknown',
        createdDate: task.date_created ? new Date(Number(task.date_created)).toLocaleDateString('tr-TR') : 'Unknown date'
    };
}

class ClickUpTagManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.selectedTag = null;
        this.selectedTags = [];
        this.searchTerm = '';
        this.groups = [{ name: 'All', open: true }];
        this.activeFilter = {};
        this.tags = [];
        console.log('[TM] Constructed ClickUpTagManager with containerId =', containerId, 'container exists =', !!this.container);
        this.initialize();
    }

    async initialize() {
        // Token kontrolü
        const token = localStorage.getItem('clickup_access_token');
        console.log('[TM] initialize() token present =', !!token, 'length =', token ? token.length : 0);
        if (!token) {
            console.warn('[TM] No token found. Showing login section.');
            showLoginSection();
            return;
        }
        
        console.log('[TM] Token found. Showing Tag Manager section and loading tags...');
        showTagManagerSection();
        
        // Load user profile first
        console.log('[TM] Starting user profile load...');
        await this.loadUserProfile();
        console.log('[TM] User profile load completed');
        
        await this.loadTagsFromClickUp();
        this.render();
        this.attachEventListeners();
        this.setupSearchAndFilter();
        
        // Initialize drag and drop after rendering
        if (typeof initializeDragAndDrop === 'function') {
            initializeDragAndDrop();
        }
        
        // Create color filter options after tags are loaded
        this.createColorFilterOptions();
        
        // Force refresh user profile after a delay to ensure it loads
        setTimeout(() => {
            console.log('[TM] Force refreshing user profile...');
            this.loadUserProfile();
        }, 2000);
    }

    async loadTagsFromClickUp() {
        // Loading durumunu göster
        this.showLoading();
        
        // Kullanıcının access token'ı ile ClickUp API'den etiketleri çek
        const token = localStorage.getItem('clickup_access_token');
        if (!token) {
            console.warn('[TM] loadTagsFromClickUp(): No token, skipping fetch');
            this.hideLoading();
            return;
        }
        // ClickUp API'den tag'leri çek (teamId otomatik olarak alınacak)
        const teamId = null; // null olarak bırak, backend otomatik olarak ilk team'i kullanacak
        try {
            console.log('[TM] Fetching tags from backend...', { hasToken: !!token, teamId });
            const res = await fetch(`https://tagmanager-api.alindakabadayi.workers.dev/api/clickup/tags?token=${token}${teamId ? `&teamId=${teamId}` : ''}`);
            console.log('[TM] /api/clickup/tags response ok =', res.ok, 'status =', res.status);
            if (!res.ok) {
                this.hideLoading();
                return;
            }
            const data = await res.json();
            console.log('[TM] Tags payload:', data);
            this.tags = data.tags || [];
            console.log('[TM] Tags loaded. count =', this.tags.length);
            
            // Loading durumunu gizle
            this.hideLoading();
        } catch (e) {
            console.error('[TM] Error while loading tags:', e);
            this.tags = [];
            this.hideLoading();
        }
    }

    render() {
        this.renderTagList();
        this.renderTagDetails();
    }

    renderTagList() {
        // Sadece ClickUp'tan gelen tag'leri listele
        const allTagsList = this.container.querySelector('#all-tags-list');
        if (!allTagsList) {
            console.warn('[TM] renderTagList(): #all-tags-list not found in container');
            return;
        }
        allTagsList.innerHTML = '';
        console.log('[TM] Rendering tag list. count =', this.tags.length);
        this.tags.forEach(tag => {
            const tagElement = document.createElement('div');
            tagElement.className = 'tag-item';
            tagElement.id = `tag-${tag.id}`;
            tagElement.setAttribute('draggable', 'true');
            tagElement.innerHTML = `
                <div class="tag-content">
                    <div class="tag-color-dot" style="background-color: ${tag.tag_bg || tag.color || '#4f8cff'}"></div>
                    <div class="tag-main-info">
                        <div class="tag-name">${tag.name}</div>
                        <div class="tag-extra">#${tag.id}</div>
                    </div>
                    <div class="tag-actions">
                        <button class="tag-action-btn edit-btn" onclick="event.stopPropagation(); tagManager.editTag('${tag.id}', '${tag.name}')" title="Edit tag">
                            <span class="action-icon">✏️</span>
                        </button>
                        <button class="tag-action-btn delete-btn" onclick="event.stopPropagation(); tagManager.deleteTag('${tag.id}', '${tag.name}')" title="Delete tag">
                            <span class="action-icon">🗑️</span>
                        </button>
                    </div>
                </div>
            `;
            tagElement.onclick = () => {
                console.log('[TM] Tag clicked:', tag);
                console.log('[TM] Tag ID:', tag.id);
                console.log('[TM] Tag name:', tag.name);
                // Remove selected class from all tags
                this.container.querySelectorAll('.tag-item').forEach(item => {
                    item.classList.remove('selected');
                });
                // Add selected class to clicked tag
                tagElement.classList.add('selected');
                this.selectedTag = tag;
                
                // Show loading for right panel
                this.showRightPanelLoading();
                
                // Show statistics panel
                this.showStatisticsPanel();
                
                // Render tag details (async)
                this.renderTagDetails();
            };
            allTagsList.appendChild(tagElement);
        });
        
        // Tag'lar render edildikten sonra drag-drop'u başlat
        setTimeout(() => {
            if (typeof initializeDragAndDrop === 'function') {
                initializeDragAndDrop();
            }
        }, 100);
        
        // Grup filtreleme seçeneklerini güncelle
        this.updateGroupFilterOptions();
    }

    async renderTagDetails() {
        const detailsPanel = this.container.querySelector('#tag-details');
        const taggedItemsPanel = this.container.querySelector('#tagged-items');
        if (!this.selectedTag) {
            detailsPanel.innerHTML = `<div class="no-selection-message">Select a tag</div>`;
            taggedItemsPanel.innerHTML = '';
            this.hideStatisticsPanel();
            return;
        }
        // ClickUp API'den bu tag ile ilişkili görevleri çek
        const token = localStorage.getItem('clickup_access_token');
        console.log('[TM] Fetching tasks for selected tag:', { tagName: this.selectedTag.name, tagId: this.selectedTag.id, hasToken: !!token });
        let taggedItems = [];
        
        if (token) {
            try {
                // Tüm list'lerden task'ları çek ve sadece bu tag'e sahip olanları filtrele
                const res = await fetch(`https://tagmanager-api.alindakabadayi.workers.dev/api/clickup/tasks?token=${token}&listId=all`);
                console.log('[TM] /api/clickup/tasks response ok =', res.ok, 'status =', res.status);
                if (res.ok) {
                    const data = await res.json();
                    const allTasks = data.tasks || [];
                    console.log('[TM] All tasks loaded:', allTasks.length);
                    
                    // Sadece seçilen tag'e sahip task'ları filtrele
                    console.log('[TM] Selected tag ID:', this.selectedTag.id);
                    console.log('[TM] All tasks count:', allTasks.length);
                    
                    const filteredTasks = allTasks.filter(task => {
                        const hasTag = task.tags && task.tags.some(tag => tag.name === this.selectedTag.id);
                        if (hasTag) {
                            console.log('[TM] Task', task.id, 'has selected tag:', this.selectedTag.id);
                        }
                        return hasTag;
                    });
                    console.log('[TM] Filtered tasks for tag', this.selectedTag.id, ':', filteredTasks.length);
                    
                    taggedItems = filteredTasks.map(mapClickUpTaskToUI);
                    console.log('[TM] Tagged items mapped. count =', taggedItems.length);
                }
            } catch (e) {
                console.error('[TM] Error while loading tasks:', e);
            }
        } else {
            console.warn('[TM] Missing token. token?', !!token);
        }
        detailsPanel.innerHTML = `
            <div class="tag-details-header">
                <div class="tag-details-color" style="background-color: ${this.selectedTag.tag_bg || this.selectedTag.color || '#4f8cff'}" onclick="tagManager.changeTagColor('${this.selectedTag.name}', '${this.selectedTag.tag_bg || this.selectedTag.color || '#4f8cff'}')"></div>
                <div class="tag-details-info">
                    <h3 class="tag-details-title">${this.selectedTag.name}</h3>
                    <div class="tag-details-meta">
                        <div class="tag-meta-item">
                            <span>🏢</span>
                            <span>#${this.selectedTag.id}</span>
                        </div>
                        <div class="tag-meta-item">
                            <span>👤</span>
                            <span>${this.selectedTag.creator_name || this.selectedTag.creator_id || 'Unknown'}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="tag-details-stats">
                <div class="stat-item">
                    <div class="stat-value">${taggedItems.length}</div>
                    <div class="stat-label">Related Tasks</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">Active</div>
                    <div class="stat-label">Status</div>
                </div>
            </div>
        `;
        
        taggedItemsPanel.innerHTML = `
            <div class="tagged-items-header">
                <span class="task-count">${taggedItems.length} tasks</span>
            </div>
            ${taggedItems.length > 0 ? taggedItems.map(item => `
                <div class="tagged-item">
                    <div class="item-header">
                        <span class="item-id">${item.displayId || item.id}</span>
                        <div class="item-badges">
                            <span class="item-type">${item.type}</span>
                            <span class="item-priority ${item.priority.toLowerCase()}">${item.priority}</span>
                        </div>
                    </div>
                    <div class="item-title">${item.title}</div>
                    <div class="item-details">
                        <span class="item-status ${item.status.toLowerCase().replace(' ', '-')}">${item.status}</span>
                        <div class="item-meta">
                            ${item.assignee && item.assignee !== 'Unassigned' ? `
                                <div class="item-meta-item">
                                    <span>👤</span>
                                    <span>${item.assignee}</span>
                                </div>
                            ` : ''}
                            ${item.dueDate && item.dueDate !== 'No due date' ? `
                                <div class="item-meta-item">
                                    <span>📅</span>
                                    <span>${item.dueDate}</span>
                                </div>
                            ` : ''}
                            <div class="item-meta-item">
                                <span>👨‍💼</span>
                                <span>${item.creator || 'Unknown'}</span>
                            </div>
                            <div class="item-meta-item">
                                <span>📆</span>
                                <span class="item-created-date">${item.createdDate || 'Unknown date'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('') : `<div class="no-data-message">No tasks found</div>`}
        `;
        
        // Calculate and render statistics
        await this.calculateAndRenderStatistics(taggedItems);

    }

    setupSearchAndFilter() {
        const searchInput = this.container.querySelector('#search-input');
        const allButton = this.container.querySelector('.btn-all');
        const filterBtn = this.container.querySelector('#filter-btn');
        const filterPanel = this.container.querySelector('#filter-panel');
        const applyFilter = this.container.querySelector('#apply-filter');
        const clearFilter = this.container.querySelector('#clear-filter');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterTags(e.target.value);
            });
        }
        
        // All tags toggle (sadece "All" alanına tıklayınca)
        const allTagsToggle = this.container.querySelector('#all-tags-toggle');
        if (allTagsToggle) {
            allTagsToggle.addEventListener('click', (e) => {
                // Eğer + butonuna tıklanmadıysa toggle yap
                if (!e.target.closest('.btn-add-group')) {
                    this.toggleAllTags();
                }
            });
        }

        // Grup oluşturma butonu
        const addGroupBtn = this.container.querySelector('#add-group-btn');
        if (addGroupBtn) {
            addGroupBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // "All" toggle'ını tetiklemesin
                this.createNewGroup();
            });
        }
        
        // Filter panel toggle - HTML onclick kullanıldığı için burada event listener eklemiyoruz

        
        // Apply filter
        if (applyFilter) {
            applyFilter.addEventListener('click', () => {
                this.applyFilters();
                // Panel'i kapatma - kalıcı olarak açık kalsın
            });
        }
        
        // Clear filter
        if (clearFilter) {
            clearFilter.addEventListener('click', () => {
                this.clearFilters();
                // Panel'i kapatma - kalıcı olarak açık kalsın
            });
        }
        
        // Group filter change
        const groupFilter = this.container.querySelector('#group-filter');
        if (groupFilter) {
            groupFilter.addEventListener('change', (e) => {
                this.applyFilters();
            });
        }
    }
    
    // Dinamik renk seçenekleri oluştur
    createColorFilterOptions() {
        const colorDropdown = this.container.querySelector('#color-filter-dropdown');
        if (!colorDropdown) return;
        
        // Mevcut tag'lerden benzersiz renkleri topla
        const uniqueColors = new Set();
        this.tags.forEach(tag => {
            if (tag.color) {
                uniqueColors.add(tag.color);
            }
        });
        
        // "All Colors" seçeneğini koru, diğerlerini temizle
        const allColorsOption = colorDropdown.querySelector('[data-color="all"]');
        colorDropdown.innerHTML = '';
        colorDropdown.appendChild(allColorsOption);
        
        // Her benzersiz renk için seçenek oluştur
        uniqueColors.forEach(color => {
            const colorOption = document.createElement('div');
            colorOption.className = 'color-option';
            colorOption.setAttribute('data-color', color);
            colorOption.innerHTML = `
                <span class="color-dot" style="background-color: ${color}"></span>
                <span>${color}</span>
            `;
            
            // Renk seçeneğine tıklama olayı ekle
            colorOption.addEventListener('click', () => {
                this.selectColor(color);
            });
            
            colorDropdown.appendChild(colorOption);
        });
        
        // "All Colors" seçeneğine tıklama olayı ekle
        allColorsOption.addEventListener('click', () => {
            this.selectColor('all');
        });
        
        // Dropdown toggle olayı ekle
        const colorDisplay = this.container.querySelector('#color-filter-display');
        if (colorDisplay) {
            colorDisplay.addEventListener('click', () => {
                this.toggleColorDropdown();
            });
        }
        

    }
    
    // Renk seç
    selectColor(color) {
        const selectedColorDot = this.container.querySelector('#selected-color-dot');
        const selectedColorText = this.container.querySelector('#selected-color-text');
        const colorDropdown = this.container.querySelector('#color-filter-dropdown');
        
        if (color === 'all') {
            selectedColorDot.style.backgroundColor = 'transparent';
            selectedColorText.textContent = 'All Colors';
        } else {
            selectedColorDot.style.backgroundColor = color;
            selectedColorText.textContent = color;
        }
        
        // Dropdown'ı kapat
        colorDropdown.style.display = 'none';
        
        // Seçili rengi sakla
        this.selectedColor = color;
        

    }
    
    // Renk dropdown'ını aç/kapat
    toggleColorDropdown() {
        const colorDropdown = this.container.querySelector('#color-filter-dropdown');
        const currentDisplay = colorDropdown.style.display;
        colorDropdown.style.display = currentDisplay === 'none' ? 'block' : 'none';
    }
    
    // Renk için kontrast renk hesapla (siyah veya beyaz)
    getContrastColor(hexColor) {
        // Hex'i RGB'ye çevir
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        
        // Luminance hesapla
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        // Koyu arka plan için beyaz, açık arka plan için siyah
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }
    
    applyFilters() {
        const groupFilter = this.container.querySelector('#group-filter');
        
        if (!groupFilter) {
            console.log('[FE] Group filter element not found');
            return;
        }
        
        const selectedGroup = groupFilter.value;
        const selectedColor = this.selectedColor || 'all';
        
        const tagItems = this.container.querySelectorAll('.tag-item');
        
        tagItems.forEach(tagItem => {
            const tagColorDot = tagItem.querySelector('.tag-color-dot');
            const tagColor = tagColorDot ? tagColorDot.style.backgroundColor : '';
            
            // Grup filtrelemesi - tag'ın hangi grupta olduğunu kontrol et
            let showByGroup = true;
            if (selectedGroup !== 'all') {
                const parentGroup = tagItem.closest('.group-item');
                const tagGroup = parentGroup ? parentGroup.getAttribute('data-group') : null;
                showByGroup = tagGroup === selectedGroup;
            }
            
            // Renk filtrelemesi
            let showByColor = selectedColor === 'all' || this.colorMatches(tagColor, selectedColor);
            

            
            tagItem.style.display = (showByGroup && showByColor) ? 'block' : 'none';
        });
        

    }
    
    colorMatches(backgroundColor, selectedColor) {
        // Eğer "all" seçilmişse her zaman true döndür
        if (selectedColor === 'all') {
            return true;
        }
        
        if (backgroundColor && selectedColor) {
            // RGB formatını hex'e çevir
            let bgHex = backgroundColor;
            if (backgroundColor.startsWith('rgb(')) {
                bgHex = this.rgbToHex(backgroundColor);
            }
            
            // Renk kodlarını normalize et (büyük harf yap)
            const normalizedBg = bgHex.toUpperCase();
            const normalizedSelected = selectedColor.toUpperCase();
            

            
            return normalizedBg === normalizedSelected;
        }
        
        return false;
    }
    
    // RGB'yi hex'e çevir
    rgbToHex(rgb) {
        // rgb(110, 86, 207) -> #6E56CF
        const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
        }
        return rgb;
    }
    
    clearFilters() {
        const groupFilter = this.container.querySelector('#group-filter');
        
        if (groupFilter) groupFilter.value = 'all';
        
        // Renk seçimini "All Colors"a sıfırla
        this.selectColor('all');
        
        this.showAllTags();
        

    }
    
    filterTags(searchTerm) {
        const tagItems = this.container.querySelectorAll('.tag-item');
        const lowerSearchTerm = searchTerm.toLowerCase();
        
        tagItems.forEach(tagItem => {
            const tagName = tagItem.querySelector('.tag-name').textContent.toLowerCase();
            const tagId = tagItem.querySelector('.tag-extra').textContent.toLowerCase();
            
            if (tagName.includes(lowerSearchTerm) || tagId.includes(lowerSearchTerm)) {
                tagItem.style.display = 'block';
            } else {
                tagItem.style.display = 'none';
            }
        });
    }
    
    showAllTags() {
        const tagItems = this.container.querySelectorAll('.tag-item');
        tagItems.forEach(tagItem => {
            tagItem.style.display = 'block';
        });
        
        const searchInput = this.container.querySelector('#search-input');
        if (searchInput) {
            searchInput.value = '';
        }
    }
    
    // All tags toggle
    toggleAllTags() {
        const allTagsList = this.container.querySelector('#all-tags-list');
        const allTagsToggle = this.container.querySelector('#all-tags-toggle');
        
        if (allTagsList && allTagsToggle) {
            const currentDisplay = allTagsList.style.display;
            const newDisplay = currentDisplay === 'none' ? 'block' : 'none';
            
            allTagsList.style.display = newDisplay;
            
            if (newDisplay === 'block') {
                allTagsToggle.classList.add('expanded');
            } else {
                allTagsToggle.classList.remove('expanded');
            }
            
    
        }
    }
    
    // Grup toggle
    toggleGroup(groupName) {
        const groupElement = this.container.querySelector(`[data-group="${groupName}"]`);
        if (groupElement) {
            const groupHeader = groupElement.querySelector('.group-header');
            const groupTags = groupElement.querySelector('.group-tags');
            const toggleArrow = groupHeader.querySelector('.group-toggle-arrow');
            
            if (groupTags && groupHeader && toggleArrow) {
                const currentDisplay = groupTags.style.display;
                const newDisplay = currentDisplay === 'none' ? 'block' : 'none';
                
                groupTags.style.display = newDisplay;
                
                if (newDisplay === 'block') {
                    groupHeader.classList.add('expanded');
                    toggleArrow.style.transform = 'rotate(180deg)';
                } else {
                    groupHeader.classList.remove('expanded');
                    toggleArrow.style.transform = 'rotate(0deg)';
                }
                
        
            }
        }
    }
    
    // Yeni grup oluştur
    createNewGroup() {
        const groupName = prompt('Grup adını girin:');
        if (groupName && groupName.trim()) {
            this.addGroup(groupName.trim());
        }
    }
    
    // Grubu ekle
    addGroup(groupName) {
        const tagsFilter = this.container.querySelector('.tags-filter');
        if (!tagsFilter) {
            console.log('[FE] Tags filter container not found');
            return;
        }
        
        // Yeni grup elementi oluştur
        const groupElement = document.createElement('div');
        groupElement.className = 'group-item';
        groupElement.setAttribute('data-group', groupName);
        groupElement.innerHTML = `
            <div class="group-header" onclick="tagManager.toggleGroup('${groupName}')">
                <span class="group-name">${groupName}</span>
                <span class="group-toggle-arrow">▼</span>
                <button class="btn-remove-group" onclick="event.stopPropagation(); tagManager.removeGroup('${groupName}')">×</button>
            </div>
            <div class="group-tags" data-group="${groupName}" style="display: none;">
                <!-- Bu gruba sürüklenen tag'lar buraya gelecek -->
            </div>
        `;
        
        // "All" toggle'dan sonra ekle (all-tags-list'ten önce)
        const allTagsList = tagsFilter.querySelector('#all-tags-list');
        if (allTagsList) {
            allTagsList.parentNode.insertBefore(groupElement, allTagsList.nextSibling);
    
            
            // Grup filtreleme dropdown'ını güncelle
            this.updateGroupFilterOptions();
            
            // Yeni grup oluşturulduktan sonra drag-drop'u yeniden başlat
            setTimeout(() => {
                if (typeof initializeDragAndDrop === 'function') {
                    initializeDragAndDrop();
                }
            }, 100);
        } else {
            console.log('[FE] All tags list not found');
        }
    }
    
    // Grubu kaldır
    removeGroup(groupName) {
        const groupElement = this.container.querySelector(`[data-group="${groupName}"]`);
        if (groupElement) {
            // Grubun içindeki tag'ları "All" bölümüne geri taşı
            const groupTags = groupElement.querySelectorAll('.tag-item');
            const allTagsList = this.container.querySelector('#all-tags-list');
            
            groupTags.forEach(tag => {
                if (allTagsList) {
                    allTagsList.appendChild(tag);
                }
            });
            
            // Grubu kaldır
            groupElement.remove();
    
            
            // Grup filtreleme dropdown'ını güncelle
            this.updateGroupFilterOptions();
        }
    }
    
    // Grup filtreleme seçeneklerini güncelle
    updateGroupFilterOptions() {
        const groupFilter = this.container.querySelector('#group-filter');
        if (!groupFilter) {
            console.log('[FE] Group filter element not found');
            return;
        }
        
        // Mevcut seçenekleri temizle (sadece "All" kalsın)
        groupFilter.innerHTML = '<option value="all">All</option>';
        
        // Mevcut grupları bul ve ekle
        const groupItems = this.container.querySelectorAll('.group-item');
        groupItems.forEach(groupItem => {
            const groupName = groupItem.getAttribute('data-group');
            if (groupName) {
                const option = document.createElement('option');
                option.value = groupName;
                option.textContent = groupName;
                groupFilter.appendChild(option);
            }
        });
        
        console.log('[FE] Group filter options updated. Groups found:', groupItems.length);
    }
    
    // Grup filtreleme fonksiyonu
    filterByGroup(selectedGroup) {
        const tagItems = this.container.querySelectorAll('.tag-item');
        
        tagItems.forEach(tagItem => {
            if (selectedGroup === 'all') {
                // Tüm tag'ları göster
                tagItem.style.display = 'block';
            } else {
                // Tag'ın hangi grupta olduğunu kontrol et
                const parentGroup = tagItem.closest('.group-item');
                const tagGroup = parentGroup ? parentGroup.getAttribute('data-group') : null;
                
                if (tagGroup === selectedGroup) {
                    tagItem.style.display = 'block';
                } else {
                    tagItem.style.display = 'none';
                }
            }
        });
        
        console.log('[FE] Filtered by group:', selectedGroup);
    }
    
    // Loading durumunu göster
    showLoading() {
        const loadingContainer = this.container.querySelector('#loading-container');
        const allTagsToggle = this.container.querySelector('#all-tags-toggle');
        
        if (loadingContainer) {
            loadingContainer.style.display = 'flex';
        }
        if (allTagsToggle) {
            allTagsToggle.style.display = 'none';
        }
        
        console.log('[FE] Loading indicator shown');
    }
    
    // Loading durumunu gizle
    hideLoading() {
        const loadingContainer = this.container.querySelector('#loading-container');
        const allTagsToggle = this.container.querySelector('#all-tags-toggle');
        
        if (loadingContainer) {
            loadingContainer.style.display = 'none';
        }
        if (allTagsToggle) {
            allTagsToggle.style.display = 'flex';
        }
        
        console.log('[FE] Loading indicator hidden');
    }
    
    // Right panel loading durumunu göster
    showRightPanelLoading() {
        const tagDetails = this.container.querySelector('#tag-details');
        const taggedItems = this.container.querySelector('#tagged-items');
        
        if (tagDetails) {
            tagDetails.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">Loading tag details...</div>
                </div>
            `;
        }
        if (taggedItems) {
            taggedItems.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">Loading related tasks...</div>
                </div>
            `;
        }
        
        console.log('[FE] Right panel loading indicators shown');
    }
    
    // Right panel loading durumunu gizle
    hideRightPanelLoading() {
        // Loading'ler renderTagDetails() fonksiyonunda otomatik olarak güncellenir
        console.log('[FE] Right panel loading indicators will be replaced by content');
    }
    
    // Tab-specific loading indicator fonksiyonları
    showTabLoading(tabId) {
        const tab = document.querySelector(tabId);
        if (tab) {
            // Mevcut içeriği sakla
            if (!tab.dataset.originalContent) {
                tab.dataset.originalContent = tab.innerHTML;
            }
            
            // Loading spinner ekle
            tab.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 200px;">
                    <div class="spinner"></div>
                </div>
            `;
        }
    }

    hideTabLoading(tabId) {
        const tab = document.querySelector(tabId);
        if (tab && tab.dataset.originalContent) {
            tab.innerHTML = tab.dataset.originalContent;
            delete tab.dataset.originalContent;
        }
    }

    // Global loading indicator (sadece gerektiğinde)
    showLoadingIndicator() {
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.id = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    hideLoadingIndicator() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            document.body.removeChild(overlay);
        }
    }

    // Renk değiştirme fonksiyonu
    async changeTagColor(tagId, currentColor) {
        console.log('[TM] changeTagColor called:', { tagId, currentColor });
        
        // Renk seçenekleri
        const colorOptions = [
            '#3E63DD', '#4f8cff', '#6b7280', '#ef4444', '#f59e0b', '#10b981',
            '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
            '#14b8a6', '#f43f5e', '#a855f7', '#eab308', '#22c55e', '#3b82f6',
            '#fbbf24', '#34d399', '#f87171', '#a78bfa', '#fb7185', '#67e8f9',
            '#bef264', '#fdba74', '#86efac', '#c4b5fd', '#fda4af', '#a5f3fc'
        ];
        
        // Renk picker modal'ını oluştur
        const modal = document.createElement('div');
        modal.className = 'color-picker-overlay';
        modal.innerHTML = `
            <div class="color-picker-modal">
                <div class="color-picker-header">
                    <h3 class="color-picker-title">Tag Rengini Değiştir</h3>
                    <button class="color-picker-close">&times;</button>
                </div>
                <div class="color-picker-grid">
                    ${colorOptions.map(color => `
                        <div class="color-option ${color === currentColor ? 'selected' : ''}" 
                             style="background-color: ${color}" 
                             data-color="${color}"></div>
                    `).join('')}
                </div>
                <div class="color-picker-actions">
                    <button class="color-picker-btn cancel">İptal</button>
                    <button class="color-picker-btn apply" disabled>Uygula</button>
                </div>
            </div>
        `;
        
        // Modal'ı sayfaya ekle
        document.body.appendChild(modal);
        
        // Seçili renk
        let selectedColor = currentColor;
        const applyBtn = modal.querySelector('.color-picker-btn.apply');
        
        // Renk seçimi
        modal.querySelectorAll('.color-option').forEach(option => {
            option.addEventListener('click', () => {
                // Önceki seçimi kaldır
                modal.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
                // Yeni seçimi işaretle
                option.classList.add('selected');
                selectedColor = option.dataset.color;
                applyBtn.disabled = false;
            });
        });
        
        // Modal kapatma
        const closeModal = () => {
            document.body.removeChild(modal);
        };
        
        modal.querySelector('.color-picker-close').addEventListener('click', closeModal);
        modal.querySelector('.color-picker-btn.cancel').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        // Uygula butonu
        applyBtn.addEventListener('click', async () => {
            if (selectedColor === currentColor) {
                closeModal();
                return;
            }
            
            try {
                const token = localStorage.getItem('clickup_access_token');
                
                if (!token) {
                    alert('No access token found. Please login again.');
                    return;
                }
                
                closeModal();
                
                // Show loading in tags and tag details tabs
                this.showTabLoading('#tag-list');
                this.showTabLoading('#tag-details');
                
                const response = await fetch(`https://tagmanager-api.alindakabadayi.workers.dev/api/clickup/tag/${tagId}/color`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ color: selectedColor })
                });
                
                if (response.ok) {
                    const responseData = await response.json();
                    
                    // Update only the selected tag's color locally
                    if (this.selectedTag && this.selectedTag.name === tagId) {
                        this.selectedTag.tag_bg = selectedColor;
                        this.selectedTag.tag_fg = selectedColor;
                    }
                    
                    // Update in tags array
                    const tagIndex = this.tags.findIndex(t => t.name === tagId);
                    if (tagIndex !== -1) {
                        this.tags[tagIndex].tag_bg = selectedColor;
                        this.tags[tagIndex].tag_fg = selectedColor;
                    }
                    
                    // Re-render only tag list and details (no full page refresh)
                    this.renderTagList();
                    this.renderTagDetails();
                    
                } else {
                    const errorData = await response.json();
                    console.error('[TM] Color change failed:', errorData);
                    
                    // Hide tab loading
                    this.hideTabLoading('#tag-list');
                    this.hideTabLoading('#tag-details');
                    
                    // Show error only if it's a real error
                    if (errorData.message && !errorData.message.includes('successfully')) {
                        alert(`❌ Renk değiştirme başarısız: ${errorData.message || errorData.error || 'Unknown error'}`);
                    }
                }
            } catch (error) {
                console.error('[FE] Error changing tag color:', error);
                
                // Hide tab loading
                this.hideTabLoading('#tag-list');
                this.hideTabLoading('#tag-details');
                
                alert('❌ Renk değiştirme hatası. Lütfen tekrar deneyin.');
            }
        });
    }

    // Tag düzenleme - Using Delete + Create workaround
    async editTag(tagId, currentName) {
        console.log('[TM] editTag called:', { tagId, currentName });
        
        // Inform user about the workaround
        const confirmed = confirm(
            `🔄 Smart Tag Rename\n\n` +
            `ClickUp API doesn't support direct tag renaming.\n\n` +
            `Our smart workaround:\n` +
            `1. Find all tasks with tag: "${currentName}"\n` +
            `2. Delete the old tag from space\n` +
            `3. Create new tag with same color\n` +
            `4. Automatically re-assign new tag to all found tasks\n\n` +
            `✅ Your tasks will keep their tags!\n` +
            `The tag name will change but stay assigned to the same tasks.\n\n` +
            `Do you want to continue?`
        );
        
        if (!confirmed) {
            console.log('[TM] User cancelled tag rename');
            return;
        }
        
        const newName = prompt('Enter new tag name:', currentName);
        console.log('[TM] New name entered:', newName);
        
                if (newName && newName.trim() && newName.trim() !== currentName) {
            try {
                const token = localStorage.getItem('clickup_access_token');
                if (!token) {
                    alert('No access token found. Please login again.');
                    return;
                }

                // Show loading in all 3 tabs
                this.showTabLoading('#tag-list');
                this.showTabLoading('#tag-details');
                this.showTabLoading('#tagged-items');

                const response = await fetch(`https://tagmanager-api.alindakabadayi.workers.dev/api/clickup/tag/${tagId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ name: newName.trim() })
                });
                
                if (response.ok) {
                    const responseData = await response.json();
                    
                    // Update only the selected tag's name locally
                    if (this.selectedTag && this.selectedTag.name === tagId) {
                        this.selectedTag.name = newName.trim();
                        this.selectedTag.id = newName.trim();
                    }
                    
                    // Update in tags array
                    const tagIndex = this.tags.findIndex(t => t.name === tagId);
                    if (tagIndex !== -1) {
                        this.tags[tagIndex].name = newName.trim();
                        this.tags[tagIndex].id = newName.trim();
                    }
                    
                    // Re-render all tabs (no full page refresh)
                    this.renderTagList();
                    this.renderTagDetails();
                    
                } else {
                    const errorData = await response.json();
                    console.error('[TM] Rename failed:', errorData);
                    
                    // Hide tab loading
                    this.hideTabLoading('#tag-list');
                    this.hideTabLoading('#tag-details');
                    this.hideTabLoading('#tagged-items');
                    
                    alert(`❌ Failed to rename tag: ${errorData.message || errorData.error || 'Unknown error'}`);
                }
            } catch (error) {
                console.error('[FE] Error renaming tag:', error);
                
                // Hide tab loading
                this.hideTabLoading('#tag-list');
                this.hideTabLoading('#tag-details');
                this.hideTabLoading('#tagged-items');
                
                alert('❌ Failed to rename tag. Please try again.');
            }
        }
    }
    
    // Tag silme
    async deleteTag(tagId, tagName) {
        const confirmDelete = confirm(`Are you sure you want to delete tag "${tagName}"? This action cannot be undone.`);
        
        if (confirmDelete) {
            try {
                const token = localStorage.getItem('clickup_access_token');
                if (!token) {
                    alert('No access token found. Please login again.');
                    return;
                }
                
                // Show loading in all tabs
                this.showTabLoading('#tag-list');
                this.showTabLoading('#tag-details');
                this.showTabLoading('#tagged-items');
                
                const response = await fetch(`https://tagmanager-api.alindakabadayi.workers.dev/api/clickup/tag/${tagId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    const responseData = await response.json();
                    
                    // Remove from local tags array
                    this.tags = this.tags.filter(t => t.id !== tagId);
                    
                    // If this tag is currently selected, clear selection
                    if (this.selectedTag && this.selectedTag.id === tagId) {
                        this.selectedTag = null;
                    }
                    
                    // Re-render all tabs
                    this.renderTagList();
                    this.renderTagDetails();
                    
                } else {
                    const errorData = await response.json();
                    
                    // Hide tab loading
                    this.hideTabLoading('#tag-list');
                    this.hideTabLoading('#tag-details');
                    this.hideTabLoading('#tagged-items');
                    
                    alert(`Failed to delete tag: ${errorData.error || 'Unknown error'}`);
                }
            } catch (error) {
                console.error('[FE] Error deleting tag:', error);
                
                // Hide tab loading
                this.hideTabLoading('#tag-list');
                this.hideTabLoading('#tag-details');
                this.hideTabLoading('#tagged-items');
                
                alert('Failed to delete tag. Please try again.');
            }
        }
    }

    attachEventListeners() {
        // Arama, filtreleme, vs. eklenebilir
        console.log('[TM] attachEventListeners() called');
        
        // Manuel event listener'ı kaldır - sadece HTML onclick kullan
        
        // User profile dropdown
        this.setupUserProfileDropdown();
    }

    // Setup user profile dropdown
    setupUserProfileDropdown() {
        const profileTrigger = document.getElementById('user-profile-trigger');
        const profileDropdown = document.getElementById('user-profile-dropdown');
        
        if (profileTrigger && profileDropdown) {
            profileTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleProfileDropdown();
            });
            
            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!profileTrigger.contains(e.target) && !profileDropdown.contains(e.target)) {
                    this.closeProfileDropdown();
                }
            });
        }
    }

    // Toggle profile dropdown
    toggleProfileDropdown() {
        const profileDropdown = document.getElementById('user-profile-dropdown');
        const dropdownArrow = document.querySelector('.user-profile-trigger .dropdown-arrow');
        
        if (profileDropdown) {
            const isVisible = profileDropdown.style.display !== 'none';
            
            if (isVisible) {
                this.closeProfileDropdown();
            } else {
                this.openProfileDropdown();
            }
        }
    }

    // Open profile dropdown
    openProfileDropdown() {
        const profileDropdown = document.getElementById('user-profile-dropdown');
        const dropdownArrow = document.querySelector('.user-profile-trigger .dropdown-arrow');
        
        if (profileDropdown) {
            profileDropdown.style.display = 'block';
            if (dropdownArrow) {
                dropdownArrow.style.transform = 'rotate(180deg)';
            }
        }
    }

    // Close profile dropdown
    closeProfileDropdown() {
        const profileDropdown = document.getElementById('user-profile-dropdown');
        const dropdownArrow = document.querySelector('.user-profile-trigger .dropdown-arrow');
        
        if (profileDropdown) {
            profileDropdown.style.display = 'none';
            if (dropdownArrow) {
                dropdownArrow.style.transform = 'rotate(0deg)';
            }
        }
    }

    // Load user profile data
    async loadUserProfile() {
        try {
            const token = localStorage.getItem('clickup_access_token');
            if (!token) {
                console.log('[TM] No token available for user profile');
                this.updateUserProfile({
                    user: { username: 'User', email: 'user@example.com' },
                    team: { name: 'My Workspace', plan: 'Free' }
                });
                return;
            }

            console.log('[TM] Loading user profile with token...');
            
            // Try multiple endpoints to get user data
            let userData = null;
            
            // First try: Direct user endpoint
            try {
                const response = await fetch(`https://tagmanager-api.alindakabadayi.workers.dev/api/clickup/user?token=${token}`);
                console.log('[TM] User API response status:', response.status);
                
                if (response.ok) {
                    userData = await response.json();
                    console.log('[TM] User data received:', userData);
                }
            } catch (e) {
                console.log('[TM] User endpoint failed:', e);
            }
            
            // Second try: Teams endpoint
            if (!userData) {
                try {
                    const teamsResponse = await fetch(`https://tagmanager-api.alindakabadayi.workers.dev/api/clickup/teams?token=${token}`);
                    console.log('[TM] Teams API response status:', teamsResponse.status);
                    
                    if (teamsResponse.ok) {
                        const teamsData = await teamsResponse.json();
                        console.log('[TM] Teams data received:', teamsData);
                        
                        // Extract user info from teams data
                        if (teamsData.teams && teamsData.teams.length > 0) {
                            const firstTeam = teamsData.teams[0];
                            const firstMember = firstTeam.members?.[0];
                            
                            userData = {
                                user: {
                                    username: firstMember?.user?.username || firstMember?.user?.name || 'ClickUp User',
                                    email: firstMember?.user?.email || 'user@clickup.com',
                                    profilePicture: firstMember?.user?.profilePicture,
                                    role: firstMember?.role || 'Member'
                                },
                                team: {
                                    name: firstTeam.name || 'My Workspace',
                                    plan: firstTeam.plan || 'Free'
                                }
                            };
                        }
                    }
                } catch (e) {
                    console.log('[TM] Teams endpoint failed:', e);
                }
            }
            
            // Third try: Mock data for testing
            if (!userData) {
                console.log('[TM] Using mock data for testing');
                userData = {
                    user: { 
                        username: 'Test User', 
                        email: 'test@clickup.com',
                        role: 'Admin',
                        profilePicture: null
                    },
                    team: { 
                        name: 'Test Workspace', 
                        plan: 'Unlimited' 
                    }
                };
            }
            
            this.updateUserProfile(userData);
            
        } catch (error) {
            console.error('[TM] Error loading user profile:', error);
            // Set default values with more realistic data
            this.updateUserProfile({
                user: { 
                    username: 'ClickUp User', 
                    email: 'user@clickup.com',
                    role: 'Member'
                },
                team: { 
                    name: 'My Workspace', 
                    plan: 'Unlimited' 
                }
            });
        }
    }

    // Update user profile UI with enhanced data
    updateUserProfile(userData) {
        console.log('[TM] Updating user profile with data:', userData);
        
        const userName = userData.user?.username || userData.user?.name || 'User';
        const userEmail = userData.user?.email || 'user@example.com';
        const workspaceName = userData.team?.name || 'My Workspace';
        const workspacePlan = userData.team?.plan || 'Free';
        const profilePicture = userData.user?.profilePicture || null;
        const userInitials = this.generateInitials(userName);

        // Update user name display with animation
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            userNameElement.style.opacity = '0';
            setTimeout(() => {
                userNameElement.textContent = userName;
                userNameElement.style.opacity = '1';
            }, 150);
        }

        // Update avatar with profile picture or initials
        const userAvatarText = document.getElementById('user-avatar-text');
        const profileAvatarText = document.getElementById('profile-avatar-text');
        
        if (profilePicture) {
            // Use profile picture if available
            const userAvatar = document.querySelector('.user-avatar');
            const profileAvatar = document.querySelector('.profile-avatar');
            
            if (userAvatar) {
                userAvatar.style.backgroundImage = `url(${profilePicture})`;
                userAvatar.style.backgroundSize = 'cover';
                userAvatar.style.backgroundPosition = 'center';
            }
            if (profileAvatar) {
                profileAvatar.style.backgroundImage = `url(${profilePicture})`;
                profileAvatar.style.backgroundSize = 'cover';
                profileAvatar.style.backgroundPosition = 'center';
            }
            
            if (userAvatarText) userAvatarText.style.display = 'none';
            if (profileAvatarText) profileAvatarText.style.display = 'none';
        } else {
            // Use initials
            if (userAvatarText) userAvatarText.textContent = userInitials;
            if (profileAvatarText) profileAvatarText.textContent = userInitials;
        }

        // Update profile card with enhanced information
        const profileName = document.getElementById('profile-name');
        const profileEmail = document.getElementById('profile-email');
        const workspaceNameElement = document.getElementById('workspace-name');
        const workspacePlanElement = document.getElementById('workspace-plan');

        if (profileName) profileName.textContent = userName;
        if (profileEmail) profileEmail.textContent = userEmail;
        if (workspaceNameElement) workspaceNameElement.textContent = workspaceName;
        if (workspacePlanElement) {
            workspacePlanElement.textContent = `${workspacePlan} Plan`;
            // Add plan badge styling
            workspacePlanElement.className = `workspace-plan plan-${workspacePlan.toLowerCase()}`;
        }

        // Add user role and additional info if available
        if (userData.user?.role) {
            const roleElement = document.createElement('div');
            roleElement.className = 'user-role';
            roleElement.textContent = userData.user.role;
            
            const profileInfo = document.querySelector('.profile-info');
            if (profileInfo && !document.querySelector('.user-role')) {
                profileInfo.appendChild(roleElement);
            }
        }

        // Store user data globally for other components
        window.currentUser = userData;
    }

    // Generate initials from name
    generateInitials(name) {
        if (!name) return 'U';
        const words = name.trim().split(' ');
        if (words.length === 1) {
            return words[0].charAt(0).toUpperCase();
        }
        return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
    }

    // Show statistics panel
    showStatisticsPanel() {
        const statsContainer = document.getElementById('tag-statistics-container');
        if (statsContainer) {
            statsContainer.style.display = 'block';
        }
    }

    // Hide statistics panel
    hideStatisticsPanel() {
        const statsContainer = document.getElementById('tag-statistics-container');
        if (statsContainer) {
            statsContainer.style.display = 'none';
        }
    }

    // Calculate and render statistics
    async calculateAndRenderStatistics(taggedItems) {
        if (!taggedItems || taggedItems.length === 0) {
            this.renderEmptyStatistics();
            return;
        }

        // Calculate summary statistics
        const totalTasks = taggedItems.length;
        const completedTasks = taggedItems.filter(item => 
            item.status.toLowerCase().includes('complete') || 
            item.status.toLowerCase().includes('done')
        ).length;
        const inProgressTasks = taggedItems.filter(item => 
            item.status.toLowerCase().includes('progress') || 
            item.status.toLowerCase().includes('doing')
        ).length;
        
        // Calculate unassigned tasks
        const unassignedTasks = taggedItems.filter(item => 
            !item.assignee || item.assignee === 'Unassigned'
        ).length;

        // Update summary stats
        this.updateSummaryStats({
            totalTasks,
            completedTasks,
            inProgressTasks,
            unassignedTasks
        });

        // Calculate and render new charts
        this.renderStatusBarChart(taggedItems);
        this.renderPriorityPieChart(taggedItems);
        this.renderTimelineAreaChart(taggedItems);
        this.renderStatusDonutChart(taggedItems);
    }

    // Update summary statistics
    updateSummaryStats(stats) {
        document.getElementById('total-tasks').textContent = stats.totalTasks;
        document.getElementById('completed-tasks').textContent = stats.completedTasks;
        document.getElementById('in-progress-tasks').textContent = stats.inProgressTasks;
        
        // Update unassigned tasks instead of overdue
        const unassignedElement = document.getElementById('unassigned-tasks');
        if (unassignedElement) {
            unassignedElement.textContent = stats.unassignedTasks || 0;
        }
    }

    // Render status bar chart
    renderStatusBarChart(taggedItems) {
        const statusCounts = {
            'to do': 0,
            'in progress': 0,
            'completed': 0,
            'overdue': 0
        };
        
        taggedItems.forEach(item => {
            const status = item.status.toLowerCase();
            if (status.includes('complete') || status.includes('done')) {
                statusCounts['completed']++;
            } else if (status.includes('progress') || status.includes('doing')) {
                statusCounts['in progress']++;
            } else if (status.includes('overdue')) {
                statusCounts['overdue']++;
            } else {
                statusCounts['to do']++;
            }
        });

        const chartContainer = document.getElementById('status-bar-chart');
        const maxCount = Math.max(...Object.values(statusCounts), 1);
        
        const chartHTML = `
            <div class="bar-chart">
                ${Object.entries(statusCounts).map(([status, count]) => {
                    const height = (count / maxCount) * 100;
                    return `
                        <div class="bar-item">
                            <div class="bar" style="height: ${height}px;"></div>
                            <div class="bar-label">${status}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        chartContainer.innerHTML = chartHTML;
    }

    // Render priority pie chart
    renderPriorityPieChart(taggedItems) {
        const priorityCounts = {
            'high': 0,
            'medium': 0,
            'low': 0
        };
        
        taggedItems.forEach(item => {
            const priority = item.priority.toLowerCase();
            if (priority.includes('high') || priority.includes('urgent')) {
                priorityCounts['high']++;
            } else if (priority.includes('low')) {
                priorityCounts['low']++;
            } else {
                priorityCounts['medium']++;
            }
        });

        const chartContainer = document.getElementById('priority-pie-chart');
        const total = taggedItems.length;
        
        if (total === 0) {
            chartContainer.innerHTML = '<div class="no-data-message">No priority data available</div>';
            return;
        }
        
        const chartHTML = `
            <div class="pie-chart-container">
                <div class="pie-chart" style="background: conic-gradient(
                    #f59e0b 0deg ${(priorityCounts.medium / total) * 360}deg,
                    #10b981 ${(priorityCounts.medium / total) * 360}deg ${((priorityCounts.medium + priorityCounts.high) / total) * 360}deg,
                    #ef4444 ${((priorityCounts.medium + priorityCounts.high) / total) * 360}deg 360deg
                );"></div>
                <div class="pie-legend">
                    <div class="legend-item">
                        <div class="legend-color" style="background: #f59e0b;"></div>
                        <span>Medium: ${priorityCounts.medium}</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: #10b981;"></div>
                        <span>High: ${priorityCounts.high}</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: #ef4444;"></div>
                        <span>Low: ${priorityCounts.low}</span>
                    </div>
                </div>
            </div>
        `;

        chartContainer.innerHTML = chartHTML;
    }

    // Render assignee distribution chart
    renderAssigneeChart(taggedItems) {
        const assigneeCounts = {};
        taggedItems.forEach(item => {
            const assignee = item.assignee || 'Unassigned';
            assigneeCounts[assignee] = (assigneeCounts[assignee] || 0) + 1;
        });

        const chartContainer = document.getElementById('assignee-chart');
        const total = taggedItems.length;
        
        const chartHTML = Object.entries(assigneeCounts).map(([assignee, count]) => {
            const percentage = Math.round((count / total) * 100);
            return `
                <div class="chart-bar">
                    <div class="chart-bar-label">${assignee}</div>
                    <div class="chart-bar-container">
                        <div class="chart-bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    <div class="chart-bar-value">${count}</div>
                </div>
            `;
        }).join('');

        chartContainer.innerHTML = chartHTML || '<div class="no-data-message">No assignee data available</div>';
    }

    // Render timeline area chart
    renderTimelineAreaChart(taggedItems) {
        const chartContainer = document.getElementById('timeline-area-chart');
        
        // Generate last 5 days for timeline
        const dates = [];
        for (let i = 4; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            dates.push(date.toISOString().slice(5, 10)); // MM-DD format
        }
        
        const chartHTML = `
            <div class="timeline-chart-container">
                <div class="timeline-area">
                    <div class="timeline-line"></div>
                </div>
                <div class="timeline-labels">
                    ${dates.map(date => `<span>08-${date.slice(3)}</span>`).join('')}
                </div>
            </div>
        `;

        chartContainer.innerHTML = chartHTML;
    }

    // Render status donut chart
    renderStatusDonutChart(taggedItems) {
        const statusCounts = {
            'to do': 0,
            'in progress': 0,
            'completed': 0,
            'overdue': 0
        };
        
        taggedItems.forEach(item => {
            const status = item.status.toLowerCase();
            if (status.includes('complete') || status.includes('done')) {
                statusCounts['completed']++;
            } else if (status.includes('progress') || status.includes('doing')) {
                statusCounts['in progress']++;
            } else if (status.includes('overdue')) {
                statusCounts['overdue']++;
            } else {
                statusCounts['to do']++;
            }
        });

        const chartContainer = document.getElementById('status-donut-chart');
        const total = taggedItems.length;
        
        if (total === 0) {
            chartContainer.innerHTML = '<div class="no-data-message">No status data available</div>';
            return;
        }
        
        const chartHTML = `
            <div class="donut-chart-container">
                <div class="donut-chart"></div>
                <div class="donut-legend">
                    <div class="donut-legend-item">
                        <div class="donut-legend-color" style="background: #4f8cff;"></div>
                        <span>To Do: ${statusCounts['to do']}</span>
                    </div>
                    <div class="donut-legend-item">
                        <div class="donut-legend-color" style="background: #f59e0b;"></div>
                        <span>In Progress: ${statusCounts['in progress']}</span>
                    </div>
                    <div class="donut-legend-item">
                        <div class="donut-legend-color" style="background: #10b981;"></div>
                        <span>Completed: ${statusCounts['completed']}</span>
                    </div>
                    <div class="donut-legend-item">
                        <div class="donut-legend-color" style="background: #ef4444;"></div>
                        <span>Overdue: ${statusCounts['overdue']}</span>
                    </div>
                </div>
            </div>
        `;

        chartContainer.innerHTML = chartHTML;
    }

    // Get CSS class for status
    getStatusClass(status) {
        if (status.includes('complete') || status.includes('done')) return 'status-completed';
        if (status.includes('progress') || status.includes('doing')) return 'status-in-progress';
        if (status.includes('overdue')) return 'status-overdue';
        return 'status-to-do';
    }

    // Get CSS class for priority
    getPriorityClass(priority) {
        if (priority.includes('urgent')) return 'priority-urgent';
        if (priority.includes('high')) return 'priority-high';
        if (priority.includes('medium')) return 'priority-medium';
        if (priority.includes('low')) return 'priority-low';
        return 'priority-medium';
    }

    // Render empty statistics
    renderEmptyStatistics() {
        const containers = ['status-chart', 'priority-chart', 'assignee-chart', 'timeline-chart'];
        containers.forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                container.innerHTML = '<div class="no-data-message">No data available</div>';
            }
        });

        this.updateSummaryStats({
            totalTasks: 0,
            completedTasks: 0,
            inProgressTasks: 0,
            overdueTasks: 0,
            avgCompletionTime: 0
        });
    }
}

// Global filter panel toggle function
function toggleFilterPanel() {
    console.log('[FE] toggleFilterPanel() called');
    const filterPanel = document.querySelector('#filter-panel');
    const filterBtn = document.querySelector('#filter-btn');
    
    if (filterPanel) {
        // Panel'i aç/kapat
        const currentDisplay = filterPanel.style.display;
        const newDisplay = currentDisplay === 'none' ? 'block' : 'none';
        filterPanel.style.display = newDisplay;
        
        // Buton ikonunu değiştir
        if (newDisplay === 'block') {
            filterBtn.textContent = '▲';
        } else {
            filterBtn.textContent = '▼';
        }
        
        console.log('[FE] Panel toggled:', newDisplay);
    } else {
        console.log('[FE] Filter panel not found!');
    }
}

// Logout fonksiyonu
function logout() {
    console.log('[Auth] Logging out. Clearing token and showing login section.');
    localStorage.removeItem('clickup_access_token');
    showLoginSection();
}

// Refresh user profile function
function refreshUserProfile() {
    console.log('[Auth] Manually refreshing user profile...');
    if (window.tagManager) {
        window.tagManager.loadUserProfile();
    }
}

// Language Switch Function
function switchLanguage(lang) {
    console.log('[Lang] Switching to:', lang);
    
    const langSwitch = document.getElementById('language-switch');
    const langButtons = document.querySelectorAll('.lang-btn');
    
    // Update button states
    langButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.lang === lang) {
            btn.classList.add('active');
        }
    });
    
    // Update switch animation
    if (lang === 'tr') {
        langSwitch.classList.add('tr-active');
    } else {
        langSwitch.classList.remove('tr-active');
    }
    
    // Store language preference
    localStorage.setItem('preferred_language', lang);
    
    // Apply language changes (can be extended with actual translations)
    applyLanguageChanges(lang);
}

// Apply language changes to UI
function applyLanguageChanges(lang) {
    const translations = {
        en: {
            'page-title': 'Tag Manager',
            'panel-title-tags': 'Tags',
            'panel-title-details': 'Tag Details',
            'panel-title-data': 'Data',
            'panel-title-statistics': 'Tag Statistics',
            'search-placeholder': 'Search tags...',
            'no-selection': 'Select a tag',
            'loading': 'Loading...'
        },
        tr: {
            'page-title': 'Etiket Yöneticisi',
            'panel-title-tags': 'Etiketler',
            'panel-title-details': 'Etiket Detayları',
            'panel-title-data': 'Veriler',
            'panel-title-statistics': 'Etiket İstatistikleri',
            'search-placeholder': 'Etiket ara...',
            'no-selection': 'Bir etiket seçin',
            'loading': 'Yükleniyor...'
        }
    };
    
    const t = translations[lang] || translations.en;
    
    // Update page elements
    const pageTitle = document.querySelector('.page-title');
    if (pageTitle) pageTitle.textContent = t['page-title'];
    
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.placeholder = t['search-placeholder'];
    
    // Update panel titles
    const panelTitles = document.querySelectorAll('.panel-title');
    panelTitles.forEach((title, index) => {
        const keys = ['panel-title-tags', 'panel-title-details', 'panel-title-data', 'panel-title-statistics'];
        if (keys[index] && t[keys[index]]) {
            title.textContent = t[keys[index]];
        }
    });
}

// Initialize language on load
document.addEventListener('DOMContentLoaded', () => {
    const savedLang = localStorage.getItem('preferred_language') || 'en';
    setTimeout(() => {
        switchLanguage(savedLang);
    }, 100);
});

// Also initialize when the tag manager loads
window.addEventListener('load', () => {
    const savedLang = localStorage.getItem('preferred_language') || 'en';
    switchLanguage(savedLang);
});

// Uygulamayı başlat
const tagManager = new ClickUpTagManager('tag-manager-section');
window.tagManager = tagManager; // Make it globally accessible 