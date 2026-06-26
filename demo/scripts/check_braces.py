with open('src/pages/SalesOpportunityList.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the columns array and count braces
in_columns = False
brace_depth = 0
for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith('const columns = ['):
        in_columns = True

    if in_columns:
        for c in line:
            if c == '{': brace_depth += 1
            if c == '}': brace_depth -= 1

        if brace_depth == 0 and i > 100:
            print(f'Columns end at line {i+1}, final brace_depth={brace_depth}')
            break

        if 'title:' in line and 'dataIndex:' in line:
            # Extract title
            import re
            m = re.search(r"title: '([^']*)'", line)
            title = m.group(1) if m else '?'
            print(f'{i+1}: depth={brace_depth:3d} | {title}')
