export const getPostParams = (userId: string) => ({
  select: {
    author: {
      select: {
        id: true,
        username: true,
        nickname: true,
        icon_link: true,
      },
    },
    comment_count: true,
    content: true,
    created_at: true,
    id: true,
    like_count: true,
    likes: {
      where: {
        userId,
      },
    },
    live_link: true,
    product: {
      select: {
        id: true,
        name: true,
        price: true,
        thumbnail_link: true,
        live_release: true,
      },
    },
    images: {
      select: {
        image_link: true,
      },
    },
    ref_count: true,
    replied_ref: true,
    reposts: {
      where: {
        userId,
      },
    },
    replies: {
      include: {
        author: {
          select: {
            id: true,
            username: true,
            nickname: true,
            icon_link: true,
          },
        },

        likes: {
          where: {
            userId,
          },
        },

        reposts: {
          where: {
            userId,
          },
        },
      },
    },
    tags: {
      select: {
        tag: {
          select: {
            name: true,
          },
        },
      },
    },
    updated_at: true,
    userId: true,
  },
});
