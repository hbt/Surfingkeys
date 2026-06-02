FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

# Core desktop + VNC + tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ubuntu-mate-core \
    tigervnc-standalone-server \
    xdotool \
    dbus-x11 \
    sudo \
    curl \
    wget \
    ca-certificates \
    locales \
    && locale-gen en_US.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

# Chrome (official repo, not wget)
RUN curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
      | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] \
      http://dl.google.com/linux/chrome/deb/ stable main" \
      > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Bun (for relay server)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Create admin user
RUN useradd -m -s /bin/bash admin \
    && echo "admin:admin" | chpasswd \
    && echo "admin ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/admin

# Pre-seed Chrome prefs (suppress first-run dialogs)
RUN mkdir -p /home/admin/.config/google-chrome/Default
COPY chrome-prefs.json /home/admin/.config/google-chrome/Default/Preferences
RUN chown -R admin:admin /home/admin/.config

COPY startup.sh /startup.sh
RUN chmod +x /startup.sh

EXPOSE 5901
EXPOSE 9222
EXPOSE 9600

CMD ["/startup.sh"]
