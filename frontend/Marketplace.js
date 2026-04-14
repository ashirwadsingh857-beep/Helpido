const CATEGORY_ICONS = {
    'all': 'grid-3x3-gap',
    'tutoring': 'book-open',
    'delivery': 'truck',
    'cleaning': 'sparkles',
    'tech-support': 'cpu',
    'repairs': 'wrench',
    'errands': 'shopping-bag',
    'other': 'help-circle'
};

// Global search state
let marketplaceState = {
    selectedCategory: 'all',
    searchQuery: '',
    filters: {
        minReward: 0,
        maxReward: 10000,
        maxDistance: 10,
        sortBy: 'newest',
        status: ['open']
    },
    currentPage: 1
};

// Initialize marketplace components
function initMarketplace() {
    setupCategoryChips();
    setupSearchBar();
    setupFilterSheet();
    setupSkillEndorsement();
    renderLucideIcons();
}

// ---- CATEGORY CHIPS ----
function setupCategoryChips() {
    const categoryChips = document.querySelectorAll('.category-chip');
    categoryChips.forEach(chip => {
        chip.addEventListener('click', () => {
            categoryChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            marketplaceState.selectedCategory = chip.dataset.category;
            performSearch();
        });
    });
}

// ---- SEARCH BAR ----
function setupSearchBar() {
    const searchInput = document.getElementById('marketplace-search');
    const searchBtn = document.getElementById('marketplace-search-btn');

    if (!searchInput) return;

    // Debounced search
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            marketplaceState.searchQuery = e.target.value.trim();
            marketplaceState.currentPage = 1;
            performSearch();
        }, 300); // 300ms debounce
    });

    searchBtn.addEventListener('click', () => {
        marketplaceState.searchQuery = searchInput.value.trim();
        marketplaceState.currentPage = 1;
        performSearch();
    });
}

// ---- FILTER BOTTOM SHEET ----
function setupFilterSheet() {
    const filterBtn = document.getElementById('filter-toggle');
    const filterSheet = document.getElementById('filter-sheet');
    const filterClose = document.getElementById('filter-close');
    const resetBtn = document.getElementById('reset-filters');
    const applyBtn = document.getElementById('apply-filters');

    const minRewardInput = document.getElementById('min-reward');
    const maxRewardInput = document.getElementById('max-reward');
    const minDisplay = document.getElementById('min-display');
    const maxDisplay = document.getElementById('max-display');
    const maxDistanceInput = document.getElementById('max-distance');
    const distanceDisplay = document.getElementById('distance-display');

    // Open filter sheet
    filterBtn?.addEventListener('click', () => {
        filterSheet.classList.add('open');
    });

    // Close filter sheet
    filterClose?.addEventListener('click', () => {
        filterSheet.classList.remove('open');
    });

    // Close on backdrop click
    filterSheet?.addEventListener('click', (e) => {
        if (e.target === filterSheet) {
            filterSheet.classList.remove('open');
        }
    });

    // Update reward range display
    minRewardInput?.addEventListener('input', (e) => {
        const min = Number(e.target.value);
        const max = Number(maxRewardInput.value);
        if (min > max) {
            e.target.value = max;
        } else {
            minDisplay.textContent = min.toLocaleString();
        }
    });

    maxRewardInput?.addEventListener('input', (e) => {
        const max = Number(e.target.value);
        const min = Number(minRewardInput.value);
        if (max < min) {
            e.target.value = min;
        } else {
            maxDisplay.textContent = max.toLocaleString();
        }
    });

    // Update distance display
    maxDistanceInput?.addEventListener('input', (e) => {
        distanceDisplay.textContent = e.target.value;
    });

    // Reset filters
    resetBtn?.addEventListener('click', () => {
        minRewardInput.value = 0;
        maxRewardInput.value = 10000;
        maxDistanceInput.value = 10;
        minDisplay.textContent = '0';
        maxDisplay.textContent = '10,000';
        distanceDisplay.textContent = '10';
        document.querySelectorAll('input[name="sortBy"]').forEach(r => {
            r.checked = r.value === 'newest';
        });
        document.querySelectorAll('.status-filter input').forEach(c => {
            c.checked = c.value === 'open';
        });
    });

    // Apply filters
    applyBtn?.addEventListener('click', () => {
        marketplaceState.filters = {
            minReward: Number(minRewardInput.value),
            maxReward: Number(maxRewardInput.value),
            maxDistance: Number(maxDistanceInput.value),
            sortBy: document.querySelector('input[name="sortBy"]:checked')?.value || 'newest',
            status: Array.from(document.querySelectorAll('.status-filter input:checked'))
                .map(c => c.value)
        };
        marketplaceState.currentPage = 1;
        filterSheet.classList.remove('open');
        performSearch();
    });
}

// ---- PERFORM SEARCH ----
async function performSearch() {
    try {
        const params = new URLSearchParams({
            q: marketplaceState.searchQuery,
            category: marketplaceState.selectedCategory !== 'all' ? marketplaceState.selectedCategory : '',
            minReward: marketplaceState.filters.minReward,
            maxReward: marketplaceState.filters.maxReward,
            status: marketplaceState.filters.status[0] || 'open',
            sortBy: marketplaceState.filters.sortBy,
            page: marketplaceState.currentPage,
            limit: 20
        });

        // Remove empty parameters
        [...params].forEach(([key, value]) => {
            if (!value) params.delete(key);
        });

        const userLocation = JSON.parse(localStorage.getItem('userLocation') || 'null');
        if (userLocation) {
            params.append('lat', userLocation.latitude);
            params.append('lng', userLocation.longitude);
        }

        const response = await fetch(`/api/tasks/search?${params}`);
        const data = await response.json();

        renderTasksList(data.tasks);
    } catch (err) {
        console.error("Search error:", err);
        // Assuming showNotification is globally available in dashboard.html script
        if (typeof showNotification === 'function') {
            showNotification("Search failed. Please try again.", 'error');
        }
    }
}

// ---- RENDER TASKS LIST ----
function renderTasksList(tasks) {
    const container = document.getElementById('task-list') || document.querySelector('.task-list');
    if (!container) return;

    if (tasks.length === 0) {
        container.innerHTML = '<p class="empty-state">No tasks found. Try adjusting your filters!</p>';
        return;
    }

    container.innerHTML = tasks.map(task => `
        <div class="task-card" data-task-id="${task._id}">
            <div class="task-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <h4 style="margin:0;">${escapeHtml(task.title)}</h4>
                <button class="heart-btn" onclick="saveTask('${task._id}')" style="background:none; border:none; color:var(--text-muted); cursor:pointer;">
                    <span class="lucide-icon" data-icon="heart"></span>
                </button>
            </div>
            <p class="task-desc">${escapeHtml(task.description.substring(0, 100))}...</p>
            <div class="task-meta" style="margin-bottom:12px;">
                <span class="reward-tag">₹${task.reward}</span>
                <span class="distance-tag" style="margin-left:8px;">${task.category || 'General'}</span>
            </div>
            <button class="accept-btn" style="width:100%;" onclick="acceptTask('${task._id}')">Apply Now</button>
        </div>
    `).join('');

    renderLucideIcons();
}

// ---- SAVE TASK ----
async function saveTask(taskId) {
    try {
        const phone = localStorage.getItem('userPhone');
        const response = await fetch(`/api/tasks/${taskId}/save?phone=${phone}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId })
        });
        const data = await response.json();
        
        if (typeof showNotification === 'function') {
            showNotification(data.message, 'success');
        }
    } catch (err) {
        console.error("Save error:", err);
    }
}

// ---- SKILL ENDORSEMENT ----
function setupSkillEndorsement() {
    const skillInput = document.getElementById('skill-input');
    const confirmBtn = document.getElementById('confirm-endorsement');
    
    let selectedSkill = null;

    skillInput?.addEventListener('input', (e) => {
        const value = e.target.value.trim().toLowerCase();
        if (value.length === 0) {
            document.getElementById('skill-suggestions').innerHTML = '';
            return;
        }

        // Common skill suggestions
        const commonSkills = [
            'Python', 'JavaScript', 'Node.js', 'React', 'Plumbing', 'Electrical',
            'Cooking', 'Gardening', 'Cleaning', 'Delivery', 'Writing', 'Photography'
        ];

        const suggestions = commonSkills.filter(s => s.toLowerCase().includes(value));
        document.getElementById('skill-suggestions').innerHTML = suggestions
            .map(skill => `
                <div class="skill-suggestion" style="display:inline-block; margin:2px;" onclick="selectSkill('${skill}')">
                    ${skill}
                </div>
            `).join('');
    });

    confirmBtn?.addEventListener('click', async () => {
        selectedSkill = skillInput?.value.trim();
        if (!selectedSkill) {
            if (typeof showNotification === 'function') showNotification('Please select or enter a skill', 'warning');
            return;
        }

        const helperPhone = window.endorsementData?.helperPhone;
        const taskId = window.endorsementData?.taskId;

        try {
            const response = await fetch('/api/users/endorse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userPhone: helperPhone,
                    skill: selectedSkill,
                    endorserPhone: localStorage.getItem('userPhone'),
                    taskId
                })
            });
            const data = await response.json();
            if (typeof showNotification === 'function') showNotification(`Endorsed "${selectedSkill}"!`, 'success');
            
            // closeModal is assumed globally available
            if (typeof closeModal === 'function') {
                closeModal('endorsement-modal');
            } else {
                document.getElementById('endorsement-modal').classList.remove('open');
            }
        } catch (err) {
            console.error("Endorsement error:", err);
        }
    });
}

function selectSkill(skill) {
    const skillInput = document.getElementById('skill-input');
    if (skillInput) {
        skillInput.value = skill;
    }
    document.getElementById('skill-suggestions').innerHTML = '';
}

// ---- OPEN ENDORSEMENT MODAL ----
function openEndorsementModal(helperPhone, taskId, helperName) {
    window.endorsementData = { helperPhone, taskId };
    const modal = document.getElementById('endorsement-modal');
    const nameEl = document.getElementById('endorsement-helper-name');
    if (nameEl) nameEl.textContent = `Endorse ${helperName}'s skills`;
    modal?.classList.add('open');
}

// ---- HELPER FUNCTIONS ----
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function renderLucideIcons() {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Call on page load
document.addEventListener('DOMContentLoaded', initMarketplace);
